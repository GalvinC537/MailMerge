package mailmerge.service;

import com.fasterxml.jackson.databind.JsonNode;
import mailmerge.service.dto.OneDriveFileDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;

@Service
public class OneDriveService {

    private static final Logger log = LoggerFactory.getLogger(OneDriveService.class);

    private final WebClient graphWebClient;

    public OneDriveService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    public List<OneDriveFileDTO> listUserSpreadsheets() {
        log.debug("Listing OneDrive spreadsheets for current user");

        try {
            Mono<JsonNode> mono = graphWebClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path("/me/drive/root/children")
                    .queryParam("$select", "id,name,webUrl,parentReference,file")
                    .build()
                )
                .retrieve()
                .bodyToMono(JsonNode.class);

            JsonNode root = mono.block();
            List<OneDriveFileDTO> result = new ArrayList<>();

            if (root == null || !root.has("value")) {
                log.warn("No value array in OneDrive response");
                return result;
            }

            for (JsonNode item : root.withArray("value")) {
                JsonNode fileNode = item.get("file");
                if (fileNode == null || fileNode.isNull()) continue;

                String mimeType = fileNode.path("mimeType").asText("");
                String name = item.path("name").asText("");
                boolean isExcelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mimeType);
                boolean isExcelExt = name.toLowerCase().endsWith(".xlsx");

                if (!isExcelMime && !isExcelExt) continue;

                String id = item.path("id").asText();
                String webUrl = item.path("webUrl").asText();
                String driveId = item.path("parentReference").path("driveId").asText();

                result.add(new OneDriveFileDTO(id, driveId, name, webUrl));
            }

            return result;

        } catch (WebClientResponseException ex) {
            // ← This is the most likely thing causing your 500
            log.error("Graph error listing OneDrive files: status={} body={}",
                ex.getRawStatusCode(), ex.getResponseBodyAsString(), ex);
            // For now rethrow so JHipster shows a clear Problem with the message
            throw ex;
        } catch (Exception ex) {
            log.error("Unexpected error listing OneDrive spreadsheets", ex);
            throw new RuntimeException("Failed to list OneDrive spreadsheets", ex);
        }
    }

    public byte[] downloadSpreadsheet(String driveId, String itemId) {
        String path = (driveId == null || driveId.isBlank())
            ? "/me/drive/items/" + itemId + "/content"
            : "/drives/" + driveId + "/items/" + itemId + "/content";

        log.info("Downloading OneDrive spreadsheet from Graph path={}", path);

        return graphWebClient
            .get()
            .uri(path)
            .exchangeToMono(response -> {
                var status = response.statusCode();
                log.info("Graph response for {} → status={}", path, status.value());

                // 🚀 1) Graph is redirecting us to the real download URL
                if (status.is3xxRedirection()) {
                    String location = response.headers()
                        .header("Location")
                        .stream()
                        .findFirst()
                        .orElse(null);

                    if (location == null) {
                        return Mono.error(new IllegalStateException(
                            "Graph returned redirect with no Location header for " + path
                        ));
                    }

                    log.info("Following Graph redirect to {}", location);

                    // 2) Follow the redirect – this URL already has tempauth, no extra auth needed
                    return WebClient.create()
                        .get()
                        .uri(location)
                        .retrieve()
                        .bodyToMono(byte[].class)
                        .doOnNext(bytes ->
                            log.info("Redirect download returned {} bytes", bytes.length)
                        );
                }

                // Normal 2xx success path (Graph returned file directly)
                if (status.is2xxSuccessful()) {
                    return response.bodyToMono(byte[].class)
                        .defaultIfEmpty(new byte[0])
                        .doOnNext(bytes ->
                            log.info("Graph returned {} bytes for {}", bytes.length, path)
                        );
                }

                // Any other status → log and error
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> {
                        log.error("Graph error for {}: status={} body={}", path, status.value(), body);
                        return Mono.error(new IllegalStateException("Graph error " + status.value()));
                    });
            })
            .block();
    }
}
