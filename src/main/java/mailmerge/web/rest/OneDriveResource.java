package mailmerge.web.rest;

import mailmerge.service.OneDriveService;
import mailmerge.service.dto.OneDriveFileDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/onedrive")
public class OneDriveResource {

    private static final Logger log = LoggerFactory.getLogger(OneDriveResource.class);

    private final OneDriveService oneDriveService;

    public OneDriveResource(OneDriveService oneDriveService) {
        this.oneDriveService = oneDriveService;
    }

    @GetMapping("/spreadsheets")
    public ResponseEntity<List<OneDriveFileDTO>> listSpreadsheets() {
        log.debug("REST request to list OneDrive spreadsheets");
        List<OneDriveFileDTO> items = oneDriveService.listUserSpreadsheets();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/spreadsheets/content")
    public ResponseEntity<byte[]> getSpreadsheetContent(
        @RequestParam String itemId,
        @RequestParam(required = false) String driveId
    ) {
        log.debug("REST request to get OneDrive spreadsheet content itemId={} driveId={}", itemId, driveId);

        byte[] bytes = oneDriveService.downloadSpreadsheet(driveId, itemId);
        log.info("Downloaded {} bytes for itemId={} driveId={}", bytes.length, itemId, driveId);

        if (bytes.length == 0) {
            // Treat as server error or 404, but don't silently send 204
            log.warn("OneDrive returned 0 bytes for itemId={} driveId={}", itemId, driveId);
            return ResponseEntity.internalServerError().build();
            // or: return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ))
            .body(bytes);
    }
}
