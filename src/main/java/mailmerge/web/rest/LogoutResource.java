package mailmerge.web.rest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for managing global OIDC logout.
 *
 * This endpoint is called when the frontend (Angular) user clicks “Sign out”.
 * It handles both:
 *  - local logout (ending the Spring Security session)
 *  - and optional global logout (ending the session at the OAuth2 provider, e.g. Azure AD)
 */
@RestController
public class LogoutResource {

    // Reference to the OIDC client registration (e.g., Azure AD configuration)
    private final ClientRegistration registration;

    // Constructor injects the OIDC client registration info
    // “oidc” is the default registration ID for JHipster’s OpenID Connect setup
    public LogoutResource(ClientRegistrationRepository registrations) {
        this.registration = registrations.findByRegistrationId("oidc");
    }

    /**
     * {@code POST  /api/logout} : Logs out the current user.
     *
     * Called by Angular when the user clicks the “Sign out” button.
     *
     * @param request The current HTTP request (used to get session/origin).
     * @param idToken The user’s OIDC ID token (used for Azure/global logout).
     * @return The logout URL to redirect the browser to.
     */
    @PostMapping("/api/logout")
    public ResponseEntity<?> logout(
        HttpServletRequest request,
        @AuthenticationPrincipal(expression = "idToken") OidcIdToken idToken
    ) {
        // Fetch provider configuration (contains all OIDC endpoints, including logout)
        var providerDetails = this.registration.getProviderDetails();
        var metadata = providerDetails.getConfigurationMetadata();

        // Try to find the provider’s global logout URL (end_session_endpoint)
        Object endSessionEndpoint = metadata.get("end_session_endpoint");

        // Try to determine the app’s origin (where to redirect user after logout)
        String originUrl = request.getHeader(HttpHeaders.ORIGIN);
        if (originUrl == null || originUrl.isBlank()) {
            // Fallback: build it manually if no Origin header is present
            originUrl = request.getScheme() + "://" + request.getServerName() + ":" + request.getServerPort();
        }

        // Prepare the logout URL that the frontend will redirect the browser to
        String logoutUrl;

        if (endSessionEndpoint != null) {
            //Case 1: Provider supports global logout
            // e.g., Azure AD → https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout
            logoutUrl = endSessionEndpoint.toString()
                + "?id_token_hint=" + idToken.getTokenValue()
                + "&post_logout_redirect_uri=" + originUrl;
        } else {
            //  Case 2: Provider doesn’t support global logout
            // In that case, we just redirect back to our own app’s home page
            logoutUrl = originUrl + "/";
        }

        // Invalidate the local Spring Security session
        // This ensures the user is logged out of *your app*, even if Azure stays active
        request.getSession().invalidate();

        // Return the logout URL to the frontend (Angular)
        // Angular will read it and redirect the user there
        return ResponseEntity.ok(Map.of("logoutUrl", logoutUrl));
    }
}
