package mailmerge.service;

import mailmerge.service.dto.AttachmentDTO;
import mailmerge.service.dto.MailProgressEvent;
import org.apache.poi.ss.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import mailmerge.domain.User;
import mailmerge.repository.UserRepository;
import mailmerge.security.SecurityUtils;
import mailmerge.service.dto.InlineImageDTO;

@Service
public class MailMergeService {

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private static final Logger log = LoggerFactory.getLogger(MailMergeService.class);

    // =========================================================================
    // Dependencies
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final GraphMailService graphMailService;

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final MailProgressService progressService;

    // Look up current user's email for test sending
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final UserRepository userRepository;

    // =========================================================================
    // Constructor
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public MailMergeService(GraphMailService graphMailService, MailProgressService progressService, UserRepository userRepository) {
        this.graphMailService = graphMailService;
        this.progressService = progressService;
        this.userRepository = userRepository;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * MODERN VERSION with full metadata (To, CC, BCC, Attachments, Spreadsheet)
     *
     * Behaviour:
     *  - Reads first sheet from base64 spreadsheet
     *  - Uses row 0 as headers
     *  - For each subsequent row:
     *      - Builds a header->cellValue map
     *      - Replaces {{header}} tokens in templates
     *      - Sends via GraphMailService
     *      - Pushes SSE progress events
     *      - Throttles between rows (safeDelay)
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public void sendMailMergeAdvanced(
        String subjectTemplate,
        String bodyTemplate,
        String toTemplate,
        String ccTemplate,
        String bccTemplate,
        String spreadsheetBase64,
        String spreadsheetFileContentType,
        List<Map<String, String>> attachments,
        List<Map<String, String>> inlineImages) throws Exception {

        // Guard: spreadsheet is required
        if (spreadsheetBase64 == null || spreadsheetBase64.isEmpty()) {
            throw new IllegalArgumentException("Spreadsheet is missing");
        }

        // Decode spreadsheet bytes
        byte[] data = Base64.getDecoder().decode(spreadsheetBase64);

        // Parse workbook using Apache POI
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(data))) {
            Sheet sheet = workbook.getSheetAt(0);
            Iterator<Row> iterator = sheet.iterator();

            // Guard: spreadsheet must have at least a header row
            if (!iterator.hasNext()) {
                throw new IllegalArgumentException("Spreadsheet is empty");
            }

            // Header row -> column names (trimmed)
            Row headerRow = iterator.next();
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(cell.getStringCellValue().trim());
            }

            // Total rows excluding header (for progress bar)
            int totalCount = Math.max(sheet.getPhysicalNumberOfRows() - 1, 0);
            int sentCount = 0;

            // Inline images are shared across all rows/sends
            List<InlineImageDTO> inlineList = buildInlineImages(inlineImages);

            // Process each data row
            while (iterator.hasNext()) {
                Row row = iterator.next();

                // Build a map of "header -> cellValue" for this row
                Map<String, String> rowData = new HashMap<>();
                for (int i = 0; i < headers.size(); i++) {
                    Cell cell = row.getCell(i);
                    rowData.put(headers.get(i), cell != null ? cell.toString() : "");
                }

                // Replace {{placeholders}} for all headers in the given template string
                java.util.function.Function<String, String> replace = template -> {
                    if (template == null) return "";
                    String out = template;

                    for (var e : rowData.entrySet()) {
                        String key = e.getKey() == null ? "" : e.getKey();

                        // Replace patterns like: {{ key }} with the row value
                        out = out.replaceAll(
                            "\\{\\{\\s*" + Pattern.quote(key) + "\\s*\\}\\}",
                            Matcher.quoteReplacement(e.getValue())
                        );
                    }

                    return out;
                };

                // Apply replacements to each field
                String to = replace.apply(toTemplate);
                String cc = replace.apply(ccTemplate);
                String bcc = replace.apply(bccTemplate);
                String subject = replace.apply(subjectTemplate);
                String body = replace.apply(bodyTemplate);

                // If there is no "To" recipient, skip sending but still advance progress
                if (to == null || to.trim().isEmpty()) {
                    sentCount++; // ✅ count as processed so progress reaches totalCount

                    log.warn("⚠️ Skipping row — missing 'to' address (sentCount={}/{})", sentCount, totalCount);

                    progressService.sendProgress(
                        new MailProgressEvent(
                            "(skipped)",
                            false,
                            sentCount,
                            totalCount,
                            "Skipped row: missing 'To' after token/conditional replacement"
                        )
                    );

                    continue;
                }

                // Build attachments list for this send
                List<AttachmentDTO> attachList = new ArrayList<>();
                if (attachments != null && !attachments.isEmpty()) {
                    for (Map<String, String> a : attachments) {
                        if (a == null) continue;

                        String base64 = a.get("file");
                        if (base64 == null || base64.isEmpty()) continue;

                        AttachmentDTO dto = new AttachmentDTO();
                        dto.setName(a.get("name"));
                        dto.setFileContentType(a.get("fileContentType"));
                        dto.setFile(Base64.getDecoder().decode(base64));
                        attachList.add(dto);
                    }
                }

                log.info("📧 Sending to={} cc={} bcc={} subject={} attachments={}",
                    to, cc, bcc, subject, attachList.size());

                // Do the actual send
                boolean success = graphMailService.sendMail(to, cc, bcc, subject, body, attachList, inlineList);

                // Count as processed after attempt
                sentCount++;

                // Push progress to SSE clients
                progressService.sendProgress(
                    new MailProgressEvent(
                        to,
                        success,
                        sentCount,
                        totalCount,
                        success ? "Email sent successfully" : "Failed to send"
                    )
                );

                // Optional throttle delay (avoid hammering Graph API)
                safeDelay(1000);
            }
        }
    }

    /**
     * TEST VERSION: send ONE merged email (first data row) to the current user's email.
     *
     * Safety:
     *  - Ignores toTemplate/ccTemplate/bccTemplate to prevent accidental external emailing
     *  - Always sends to current logged-in user's resolved email
     *  - Prefixes subject with [TEST]
     *  - Emits a 1/1 progress event for UI
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public void sendMailMergeAdvancedTest(
        String subjectTemplate,
        String bodyTemplate,
        String toTemplate,
        String ccTemplate,
        String bccTemplate,
        String spreadsheetBase64,
        String spreadsheetFileContentType,
        List<Map<String, String>> attachments,
        List<Map<String, String>> inlineImages) throws Exception {

        // Guard: spreadsheet is required
        if (spreadsheetBase64 == null || spreadsheetBase64.isEmpty()) {
            throw new IllegalArgumentException("Spreadsheet is missing");
        }

        // Resolve current logged-in user's email as the test recipient
        String testRecipient = resolveCurrentUserEmail();

        // Decode spreadsheet bytes
        byte[] data = Base64.getDecoder().decode(spreadsheetBase64);

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(data))) {
            Sheet sheet = workbook.getSheetAt(0);

            // Header row is required
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("Spreadsheet is empty");
            }

            // First data row is required for test send
            Row firstDataRow = sheet.getRow(1);
            if (firstDataRow == null) {
                throw new IllegalArgumentException("Spreadsheet has no data rows (needs at least 1 row under headers)");
            }

            DataFormatter formatter = new DataFormatter();

            // Build headers list from header row
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(formatter.formatCellValue(cell).trim());
            }

            // Map headers -> values for the first data row only
            Map<String, String> rowData = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i);
                if (header == null || header.trim().isEmpty()) continue;

                Cell cell = firstDataRow.getCell(i);
                String value = cell != null ? formatter.formatCellValue(cell) : "";
                rowData.put(header, value);
            }

            // Replace {{placeholders}} using first row only
            java.util.function.Function<String, String> replace = template -> {
                if (template == null) return "";
                String out = template;

                for (var e : rowData.entrySet()) {
                    String key = e.getKey() == null ? "" : e.getKey();
                    out = out.replaceAll(
                        "\\{\\{\\s*" + Pattern.quote(key) + "\\s*\\}\\}",
                        Matcher.quoteReplacement(e.getValue())
                    );
                }

                return out;
            };

            String subject = replace.apply(subjectTemplate);
            String body = replace.apply(bodyTemplate);

            // Inline images are shared across the send
            List<InlineImageDTO> inlineList = buildInlineImages(inlineImages);

            // Make it obvious this is not a real send
            if (subject == null) subject = "";
            subject = "[TEST] " + subject;

            // Build attachments list
            List<AttachmentDTO> attachList = new ArrayList<>();
            if (attachments != null && !attachments.isEmpty()) {
                for (Map<String, String> a : attachments) {
                    if (a == null) continue;

                    String base64 = a.get("file");
                    if (base64 == null || base64.isEmpty()) continue;

                    AttachmentDTO dto = new AttachmentDTO();
                    dto.setName(a.get("name"));
                    dto.setFileContentType(a.get("fileContentType"));
                    dto.setFile(Base64.getDecoder().decode(base64));
                    attachList.add(dto);
                }
            }

            log.info("🧪 Sending TEST email to={} subject={} attachments={}", testRecipient, subject, attachList.size());

            // Send only to the current user (cc/bcc blanked)
            boolean success = graphMailService.sendMail(
                testRecipient,
                "",   // cc
                "",   // bcc
                subject,
                body,
                attachList,
                inlineList
            );

            // Push progress as a 1/1 event
            progressService.sendProgress(
                new MailProgressEvent(
                    testRecipient,
                    success,
                    1,
                    1,
                    success ? "Test email sent successfully" : "Failed to send test email"
                )
            );
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Resolve logged-in user's email (JHipster-style). */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private String resolveCurrentUserEmail() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new IllegalStateException("No logged-in user found for test send"));

        return userRepository.findOneByLogin(login)
            .map(User::getEmail)
            .map(String::trim)
            .filter(e -> !e.isEmpty())
            // Fallback: if login itself is an email, use it
            .or(() -> login.contains("@") ? Optional.of(login) : Optional.empty())
            .orElseThrow(() -> new IllegalStateException("Could not resolve current user's email address"));
    }

    /** Utility: short sleep between sends (throttle). */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private void safeDelay(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ignored) {
            // preserve interrupt status if you want:
            // Thread.currentThread().interrupt();
        }
    }

    /**
     * Convert inline image maps coming from the frontend into InlineImageDTOs.
     *
     * Expected keys in each map:
     *  - cid
     *  - fileContentType
     *  - base64
     *  - name (optional)
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private List<InlineImageDTO> buildInlineImages(List<Map<String, String>> inlineImages) {
        List<InlineImageDTO> out = new ArrayList<>();
        if (inlineImages == null) return out;

        for (Map<String, String> img : inlineImages) {
            if (img == null) continue;

            String cid = img.get("cid");
            String contentType = img.get("fileContentType");
            String base64 = img.get("base64");
            String name = img.get("name");

            // Skip invalid entries
            if (cid == null || cid.isBlank()) continue;
            if (contentType == null || contentType.isBlank()) continue;
            if (base64 == null || base64.isBlank()) continue;

            InlineImageDTO dto = new InlineImageDTO();
            dto.setCid(cid.trim());
            dto.setName((name == null || name.isBlank()) ? (cid + ".png") : name);
            dto.setFileContentType(contentType);
            dto.setFile(Base64.getDecoder().decode(base64));

            out.add(dto);
        }

        return out;
    }
}
