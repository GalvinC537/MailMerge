package mailmerge.web.rest;

import java.security.Principal;
import mailmerge.service.UserService;
import mailmerge.service.dto.AdminUserDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import mailmerge.security.SecurityUtils;

/**
 * REST controller for managing the current user's account.
 */
@RestController
@RequestMapping("/api")
public class AccountResource {

    private static class AccountResourceException extends RuntimeException {

        private static final long serialVersionUID = 1L;

        private AccountResourceException(String message) {
            super(message);
        }
    }

    private static final Logger LOG = LoggerFactory.getLogger(AccountResource.class);

    private final UserService userService;

    public AccountResource(UserService userService) {
        this.userService = userService;
    }

    /**
     * {@code GET  /account} : get the current user.
     *
     * @param principal the current user; resolves to {@code null} if not authenticated.
     * @return the current user.
     * @throws AccountResourceException {@code 500 (Internal Server Error)} if the user couldn't be returned.
     */
    @GetMapping("/account")
    public AdminUserDTO getAccount(Principal principal) {
        if (principal instanceof AbstractAuthenticationToken) {
            return userService.getUserFromAuthentication((AbstractAuthenticationToken) principal);
        } else {
            throw new AccountResourceException("User could not be found");
        }
    }

    /**
     * Update the current user's email signature (HTML/Text).
     * Client sends JSON: { "emailSignature": "<p>Thanks...</p>" }
     */
    @PutMapping(value = "/account/email-signature", consumes = MediaType.APPLICATION_JSON_VALUE)
    public void updateEmailSignature(@RequestBody EmailSignatureVM body) {
        LOG.debug("REST request to update current user's email signature");
        userService.updateEmailSignature(body.emailSignature());
    }

    public record EmailSignatureVM(String emailSignature) {}

    /**
     * {@code GET  /authenticate} : check if the user is authenticated, and return its login.
     *
     * @param principal the authentication principal.
     * @return the login if the user is authenticated.
     */
    @GetMapping(value = "/authenticate", produces = MediaType.TEXT_PLAIN_VALUE)
    public String isAuthenticated(Principal principal) {
        LOG.debug("REST request to check if the current user is authenticated");
        return principal == null ? null : principal.getName();
    }

    /**
     * GET /account/signature : get the current user's email signature.
     */
    @GetMapping(value = "/account/signature", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> getEmailSignature() {
        return SecurityUtils
            .getCurrentUserLogin()
            .flatMap(userService::getUserWithAuthoritiesByLogin)
            .map(user -> ResponseEntity.ok(user.getEmailSignature() == null ? "" : user.getEmailSignature()))
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * PUT /account/signature : update the current user's email signature.
     * Client sends plain text in the request body.
     */
    @PutMapping(value = "/account/signature", consumes = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<Void> updateEmailSignaturePlain(@RequestBody String signature) {
        LOG.debug("REST request to update current user's email signature");
        userService.updateEmailSignature(signature);
        return ResponseEntity.noContent().build();
    }
}
