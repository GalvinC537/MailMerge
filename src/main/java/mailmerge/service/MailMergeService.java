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

@Service
public class MailMergeService {

    private static final Logger log = LoggerFactory.getLogger(MailMergeService.class);

    private final GraphMailService graphMailService;
    private final MailProgressService progressService;

    // Look up current user's email for test sending
    private final UserRepository userRepository;

    public MailMergeService(GraphMailService graphMailService, MailProgressService progressService, UserRepository userRepository) {
        this.graphMailService = graphMailService;
        this.progressService = progressService;
        this.userRepository = userRepository;
    }

    /** MODERN VERSION with full metadata (To, CC, BCC, Attachments, Spreadsheet) **/
    public void sendMailMergeAdvanced(
        String subjectTemplate,
        String bodyTemplate,
        String toTemplate,
        String ccTemplate,
        String bccTemplate,
        String spreadsheetBase64,
        String spreadsheetFileContentType,
        List<Map<String, String>> attachments
    ) throws Exception {

        if (spreadsheetBase64 == null || spreadsheetBase64.isEmpty()) {
            throw new IllegalArgumentException("Spreadsheet is missing");
        }

        byte[] data = Base64.getDecoder().decode(spreadsheetBase64);

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(data))) {
            Sheet sheet = workbook.getSheetAt(0);
            Iterator<Row> iterator = sheet.iterator();
            if (!iterator.hasNext()) {
                throw new IllegalArgumentException("Spreadsheet is empty");
            }

            // Header row
            Row headerRow = iterator.next();
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(cell.getStringCellValue().trim());
            }

            // total rows (excluding header)
            int totalCount = sheet.getLastRowNum();
            int sentCount = 0;

            while (iterator.hasNext()) {
                Row row = iterator.next();

                Map<String, String> rowData = new HashMap<>();
                for (int i = 0; i < headers.size(); i++) {
                    Cell cell = row.getCell(i);
                    rowData.put(headers.get(i), cell != null ? cell.toString() : "");
                }

                // Replace {{placeholders}}
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

                String to = replace.apply(toTemplate);
                String cc = replace.apply(ccTemplate);
                String bcc = replace.apply(bccTemplate);
                String subject = replace.apply(subjectTemplate);
                String body = replace.apply(bodyTemplate);

                if (to == null || to.trim().isEmpty()) {
                    log.warn("⚠️ Skipping row — missing 'to' address");
                    continue;
                }

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

                log.info("📧 Sending to={} cc={} bcc={} subject={} attachments={}",
                    to, cc, bcc, subject, attachList.size());

                // Do the actual send
                boolean success = graphMailService.sendMail(to, cc, bcc, subject, body, attachList);

                // Update counter only after attempt
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

                // Optional throttle delay
                safeDelay(1000);
            }
        }
    }

    /**
     * TEST VERSION: send ONE merged email (first data row) to the current user's email.
     * Ignores toTemplate/ccTemplate/bccTemplate to prevent accidental external emailing.
     */
    public void sendMailMergeAdvancedTest(
        String subjectTemplate,
        String bodyTemplate,
        String toTemplate,
        String ccTemplate,
        String bccTemplate,
        String spreadsheetBase64,
        String spreadsheetFileContentType,
        List<Map<String, String>> attachments
    ) throws Exception {

        if (spreadsheetBase64 == null || spreadsheetBase64.isEmpty()) {
            throw new IllegalArgumentException("Spreadsheet is missing");
        }

        String testRecipient = resolveCurrentUserEmail();

        byte[] data = Base64.getDecoder().decode(spreadsheetBase64);

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(data))) {
            Sheet sheet = workbook.getSheetAt(0);

            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("Spreadsheet is empty");
            }

            Row firstDataRow = sheet.getRow(1);
            if (firstDataRow == null) {
                throw new IllegalArgumentException("Spreadsheet has no data rows (needs at least 1 row under headers)");
            }

            DataFormatter formatter = new DataFormatter();

            // Build headers
            List<String> headers = new ArrayList<>();
            for (Cell cell : headerRow) {
                headers.add(formatter.formatCellValue(cell).trim());
            }

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

            boolean success = graphMailService.sendMail(
                testRecipient,
                "",   // cc
                "",   // bcc
                subject,
                body,
                attachList
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

    /** Resolve logged-in user's email (JHipster-style). */
    private String resolveCurrentUserEmail() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new IllegalStateException("No logged-in user found for test send"));

        return userRepository.findOneByLogin(login)
            .map(User::getEmail)
            .map(String::trim)
            .filter(e -> !e.isEmpty())
            .or(() -> login.contains("@") ? Optional.of(login) : Optional.empty())
            .orElseThrow(() -> new IllegalStateException("Could not resolve current user's email address"));
    }

    /** Utility: short sleep between sends **/
    private void safeDelay(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ignored) {
            // preserve interrupt status if you want:
            // Thread.currentThread().interrupt();
        }
    }
}
