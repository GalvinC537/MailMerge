package mailmerge.service;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import mailmerge.config.Constants;
import mailmerge.domain.Authority;
import mailmerge.domain.User;
import mailmerge.repository.AuthorityRepository;
import mailmerge.repository.UserRepository;
import mailmerge.security.SecurityUtils;
import mailmerge.service.dto.AdminUserDTO;
import mailmerge.service.dto.PublicUserDTO;
import mailmerge.service.dto.UserDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service class for managing users.
 */
@Service
@Transactional
public class UserService {

    private static final Logger LOG = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;

    private final AuthorityRepository authorityRepository;

    private final CacheManager cacheManager;

    public UserService(UserRepository userRepository, AuthorityRepository authorityRepository, CacheManager cacheManager) {
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.cacheManager = cacheManager;
    }

    /**
     * Update basic information (first name, last name, email, language) for the current user.
     *
     * @param firstName first name of user.
     * @param lastName  last name of user.
     * @param email     email id of user.
     * @param langKey   language key.
     * @param imageUrl  image URL of user.
     */
    public void updateUser(String firstName, String lastName, String email, String langKey, String imageUrl) {
        SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByLogin)
            .ifPresent(user -> {
                user.setFirstName(firstName);
                user.setLastName(lastName);
                if (email != null) {
                    user.setEmail(email.toLowerCase());
                }
                user.setLangKey(langKey);
                user.setImageUrl(imageUrl);
                userRepository.save(user);
                this.clearUserCaches(user);
                LOG.debug("Changed Information for User: {}", user);
            });
    }

    /**
     * Update ONLY the current user's email signature (HTML/Text).
     */
    public void updateEmailSignature(String emailSignature) {
        SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByLogin)
            .ifPresent(user -> {
                user.setEmailSignature(emailSignature);
                userRepository.save(user);
                this.clearUserCaches(user);
                LOG.debug("Changed email signature for User: {}", user.getLogin());
            });
    }

    @Transactional(readOnly = true)
    public Page<AdminUserDTO> getAllManagedUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(AdminUserDTO::new);
    }

    /**
     * Public endpoint backing: returns ONLY public fields (id + login).
     * This prevents leaking private data like emailSignature in /api/users.
     */
    @Transactional(readOnly = true)
    public Page<PublicUserDTO> getAllPublicUsers(Pageable pageable) {
        return userRepository
            .findAllByIdNotNullAndActivatedIsTrue(pageable)
            .map(user -> new PublicUserDTO(user.getId(), user.getLogin()));
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthoritiesByLogin(String login) {
        return userRepository.findOneWithAuthoritiesByLogin(login);
    }

    /**
     * Gets a list of all the authorities.
     * @return a list of all the authorities.
     */
    @Transactional(readOnly = true)
    public List<String> getAuthorities() {
        return authorityRepository.findAll().stream().map(Authority::getName).toList();
    }

    /**
     * IMPORTANT CHANGE:
     * Return the *persisted* user (existing user from DB) so fields like emailSignature are not lost
     * when building AdminUserDTO for /api/account.
     */
    private User syncUserWithIdP(Map<String, Object> details, User userFromIdP) {
        // Save authorities in local DB if needed
        Collection<String> dbAuthorities = getAuthorities();
        Collection<String> userAuthorities = userFromIdP.getAuthorities().stream().map(Authority::getName).toList();
        for (String authority : userAuthorities) {
            if (!dbAuthorities.contains(authority)) {
                LOG.debug("Saving authority '{}' in local database", authority);
                Authority authorityToSave = new Authority();
                authorityToSave.setName(authority);
                authorityRepository.save(authorityToSave);
            }
        }

        User existing = userRepository.findOneByLogin(userFromIdP.getLogin()).orElse(null);

        if (existing != null) {
            // If IdP sends updated_at, only update local profile fields when IdP is newer
            boolean shouldUpdate = true;
            if (details.get("updated_at") != null) {
                Instant dbModifiedDate = existing.getLastModifiedDate();
                Instant idpModifiedDate;
                if (details.get("updated_at") instanceof Instant) {
                    idpModifiedDate = (Instant) details.get("updated_at");
                } else {
                    idpModifiedDate = Instant.ofEpochSecond((Integer) details.get("updated_at"));
                }
                shouldUpdate = dbModifiedDate == null || idpModifiedDate.isAfter(dbModifiedDate);
            }

            if (shouldUpdate) {
                LOG.debug("Updating user '{}' in local database", existing.getLogin());
                existing.setFirstName(userFromIdP.getFirstName());
                existing.setLastName(userFromIdP.getLastName());
                existing.setEmail(userFromIdP.getEmail() != null ? userFromIdP.getEmail().toLowerCase() : null);
                existing.setLangKey(userFromIdP.getLangKey());
                existing.setImageUrl(userFromIdP.getImageUrl());
                existing.setActivated(userFromIdP.isActivated());
            }

            // Always keep authorities in sync
            existing.setAuthorities(userFromIdP.getAuthorities());

            userRepository.save(existing);
            this.clearUserCaches(existing);

            return existing;
        } else {
            LOG.debug("Saving user '{}' in local database", userFromIdP.getLogin());
            userRepository.save(userFromIdP);
            this.clearUserCaches(userFromIdP);
            return userFromIdP;
        }
    }

    /**
     * Returns the user from an OAuth 2.0 login or resource server with JWT.
     * Synchronizes the user in the local repository.
     *
     * @param authToken the authentication token.
     * @return the user from the authentication.
     */
    @Transactional
    public AdminUserDTO getUserFromAuthentication(AbstractAuthenticationToken authToken) {
        Map<String, Object> attributes;
        if (authToken instanceof OAuth2AuthenticationToken) {
            attributes = ((OAuth2AuthenticationToken) authToken).getPrincipal().getAttributes();
        } else if (authToken instanceof JwtAuthenticationToken) {
            attributes = ((JwtAuthenticationToken) authToken).getTokenAttributes();
        } else {
            throw new IllegalArgumentException("AuthenticationToken is not OAuth2 or JWT!");
        }

        User user = getUser(attributes);
        user.setAuthorities(
            authToken
                .getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .map(authority -> {
                    Authority auth = new Authority();
                    auth.setName(authority);
                    return auth;
                })
                .collect(Collectors.toSet())
        );

        User persisted = syncUserWithIdP(attributes, user);
        return new AdminUserDTO(persisted);
    }

    private static User getUser(Map<String, Object> details) {
        User user = new User();
        Boolean activated = Boolean.TRUE;
        String sub = String.valueOf(details.get("sub"));
        String username = null;
        if (details.get("preferred_username") != null) {
            username = ((String) details.get("preferred_username")).toLowerCase();
        }
        // handle resource server JWT, where sub claim is email and uid is ID
        if (details.get("uid") != null) {
            user.setId((String) details.get("uid"));
            user.setLogin(sub);
        } else {
            user.setId(sub);
        }
        if (username != null) {
            user.setLogin(username);
        } else if (user.getLogin() == null) {
            user.setLogin(user.getId());
        }
        if (details.get("given_name") != null) {
            user.setFirstName((String) details.get("given_name"));
        } else if (details.get("name") != null) {
            user.setFirstName((String) details.get("name"));
        }
        if (details.get("family_name") != null) {
            user.setLastName((String) details.get("family_name"));
        }
        if (details.get("email_verified") != null) {
            activated = (Boolean) details.get("email_verified");
        }
        if (details.get("email") != null) {
            user.setEmail(((String) details.get("email")).toLowerCase());
        } else if (sub.contains("|") && (username != null && username.contains("@"))) {
            // special handling for Auth0
            user.setEmail(username);
        } else {
            user.setEmail(sub);
        }
        if (details.get("langKey") != null) {
            user.setLangKey((String) details.get("langKey"));
        } else if (details.get("locale") != null) {
            // trim off country code if it exists
            String locale = (String) details.get("locale");
            if (locale.contains("_")) {
                locale = locale.substring(0, locale.indexOf('_'));
            } else if (locale.contains("-")) {
                locale = locale.substring(0, locale.indexOf('-'));
            }
            user.setLangKey(locale.toLowerCase());
        } else {
            // set langKey to default if not specified by IdP
            user.setLangKey(Constants.DEFAULT_LANGUAGE);
        }
        if (details.get("picture") != null) {
            user.setImageUrl((String) details.get("picture"));
        }
        user.setActivated(activated);
        return user;
    }

    private void clearUserCaches(User user) {
        Objects.requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_LOGIN_CACHE)).evict(user.getLogin());
        if (user.getEmail() != null) {
            Objects.requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE)).evict(user.getEmail());
        }
    }
}
