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

    // =========================================================================
    // Logging + dependencies
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private static final Logger log = LoggerFactory.getLogger(OneDriveService.class);

    // Pre-configured Graph WebClient (should already include auth via your Graph config)
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final WebClient graphWebClient;

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public OneDriveService(WebClient graphWebClient) {
        this.graphWebClient = graphWebClient;
    }

    // =========================================================================
    // List spreadsheets from OneDrive root
    // =========================================================================

    /**
     * Lists the current user's OneDrive root files and returns only Excel spreadsheets.
     * Filters by:
     *  - Graph-provided mimeType (preferred when present)
     *  - OR filename extension (.xlsx) as a fallback
     *
     * @return list of OneDriveFileDTO (id, driveId, name, webUrl)
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public List<OneDriveFileDTO> listUserSpreadsheets() {
        log.debug("Listing OneDrive spreadsheets for current user");

        try {
            // Call Graph: /me/drive/root/children
            // Select only what we need to keep payload small
            Mono<JsonNode> mono = graphWebClient
                .get()
                .uri(uriBuilder -> uriBuilder
                    .path("/me/drive/root/children")
                    .queryParam("$select", "id,name,webUrl,parentReference,file")
                    .build()
                )
                .retrieve()
                .bodyToMono(JsonNode.class);

            // Block for a simple imperative service method (OK for your current style)
            JsonNode root = mono.block();

            List<OneDriveFileDTO> result = new ArrayList<>();

            // Defensive: Graph response should contain { "value": [ ... ] }
            if (root == null || !root.has("value")) {
                log.warn("No value array in OneDrive response");
                return result;
            }

            // Iterate files/folders returned by Graph
            for (JsonNode item : root.withArray("value")) {
                // Only items that actually have "file" metadata are files (folders won’t)
                JsonNode fileNode = item.get("file");
                if (fileNode == null || fileNode.isNull()) continue;

                // Mime type is the best signal when provided
                String mimeType = fileNode.path("mimeType").asText("");
                String name = item.path("name").asText("");

                // Excel checks:
                // - Official XLSX mime type OR filename ends with .xlsx
                boolean isExcelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mimeType);
                boolean isExcelExt = name.toLowerCase().endsWith(".xlsx");

                if (!isExcelMime && !isExcelExt) continue;

                // Item ID is used to download /me/drive/items/{id}/content
                String id = item.path("id").asText();

                // webUrl is useful for debug + linking (not used for download)
                String webUrl = item.path("webUrl").asText();

                // driveId is needed if you want to support non-default drives / shared drives
                String driveId = item.path("parentReference").path("driveId").asText();

                result.add(new OneDriveFileDTO(id, driveId, name, webUrl));
            }

            return result;

        } catch (WebClientResponseException ex) {
            // Most common failure path: Graph returns 401/403/429/etc
            // Logging status + body is very helpful for diagnosing missing scopes/consent
            log.error("Graph error listing OneDrive files: status={} body={}",
                ex.getRawStatusCode(), ex.getResponseBodyAsString(), ex);

            // Rethrow so JHipster converts it into a Problem response with details
            throw ex;

        } catch (Exception ex) {
            // Any other unexpected issue gets wrapped into a runtime exception
            log.error("Unexpected error listing OneDrive spreadsheets", ex);
            throw new RuntimeException("Failed to list OneDrive spreadsheets", ex);
        }
    }

    // =========================================================================
    // Download spreadsheet bytes from Graph
    // =========================================================================

    /**
     * Downloads a spreadsheet file's raw bytes from OneDrive via Microsoft Graph.
     *
     * Notes:
     * - Graph often responds to /content with a 302/303 redirect to a pre-authenticated
     *   download URL (with a temporary token). We detect that and follow it without
     *   adding our Authorization header.
     * - If Graph returns 2xx with the bytes directly, we just return them.
     *
     * @param driveId optional drive id (can be blank/null for default drive)
     * @param itemId  the OneDrive item id for the file
     * @return raw file bytes
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public byte[] downloadSpreadsheet(String driveId, String itemId) {
        // Decide which Graph path to use depending on whether driveId is known
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

                // 1) Redirect case: Graph points us at the actual download URL
                if (status.is3xxRedirection()) {
                    String location = response.headers()
                        .header("Location")
                        .stream()
                        .findFirst()
                        .orElse(null);

                    if (location == null) {
                        // Redirect without a Location header is unexpected → fail fast
                        return Mono.error(new IllegalStateException(
                            "Graph returned redirect with no Location header for " + path
                        ));
                    }

                    log.info("Following Graph redirect to {}", location);

                    // 2) Follow the redirect URL:
                    // This link typically contains a temporary auth token already,
                    // so we use a plain WebClient without our Graph auth filter.
                    return WebClient.create()
                        .get()
                        .uri(location)
                        .retrieve()
                        .bodyToMono(byte[].class)
                        .doOnNext(bytes ->
                            log.info("Redirect download returned {} bytes", bytes.length)
                        );
                }

                // 2xx success path: Graph returned file bytes directly
                if (status.is2xxSuccessful()) {
                    return response.bodyToMono(byte[].class)
                        .defaultIfEmpty(new byte[0])
                        .doOnNext(bytes ->
                            log.info("Graph returned {} bytes for {}", bytes.length, path)
                        );
                }

                // Anything else: read body as string to log Graph error details
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> {
                        log.error("Graph error for {}: status={} body={}", path, status.value(), body);
                        return Mono.error(new IllegalStateException("Graph error " + status.value()));
                    });
            })
            // Block so caller gets bytes synchronously (consistent with listUserSpreadsheets())
            .block();
    }
}
