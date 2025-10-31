// src/main/java/mailmerge/config/GraphClientConfig.java

//sets up WebClient to call Microsoft Graph with user’s OAuth token

package mailmerge.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.AuthenticatedPrincipalOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.web.reactive.function.client.ServletOAuth2AuthorizedClientExchangeFilterFunction;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class GraphClientConfig {

    @Bean
    public OAuth2AuthorizedClientManager authorizedClientManager(
        ClientRegistrationRepository clientRegistrationRepository
    ) {
        // ✅ Fixed: needs an OAuth2AuthorizedClientService now
        var authorizedClientService = new InMemoryOAuth2AuthorizedClientService(clientRegistrationRepository);
        var authorizedClientRepository =
            new AuthenticatedPrincipalOAuth2AuthorizedClientRepository(authorizedClientService);

        var authorizedClientManager =
            new DefaultOAuth2AuthorizedClientManager(clientRegistrationRepository, authorizedClientRepository);

        // Allow authorization_code + refresh_token flows
        OAuth2AuthorizedClientProvider authorizedClientProvider =
            OAuth2AuthorizedClientProviderBuilder.builder()
                .authorizationCode()
                .refreshToken()
                .build();

        authorizedClientManager.setAuthorizedClientProvider(authorizedClientProvider);
        return authorizedClientManager;
    }

    @Bean
    public WebClient graphWebClient(OAuth2AuthorizedClientManager authorizedClientManager) {
        var oauth2 = new ServletOAuth2AuthorizedClientExchangeFilterFunction(authorizedClientManager);
        oauth2.setDefaultOAuth2AuthorizedClient(true);

        return WebClient.builder()
            .baseUrl("https://graph.microsoft.com/v1.0")
            .apply(oauth2.oauth2Configuration())
            .build();
    }
}


