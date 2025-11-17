package mailmerge.service;

import mailmerge.service.dto.AttachmentDTO;
import org.apache.poi.ss.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MailMergeService {

    private static final Logger log = LoggerFactory.getLogger(MailMergeService.class);

    private final GraphMailService graphMailService;

    public MailMergeService(GraphMailService graphMailService) {
        this.graphMailService = graphMailService;
    }

    /** LEGACY SIMPLE VERSION — kept for reference **/
    public void sendMailMerge(MultipartFile file, String subjectTemplate, String bodyTemplate) throws IOException {
        try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            Iterator<Row> rowIterator = sheet.iterator();
            if (!rowIterator.hasNext()) {
                log.warn("Excel file is empty");
                return;
            }

            // Header
            Row headerRow = rowIterator.next();
            List<String> headers = new ArrayList<>();
            headerRow.forEach(cell -> headers.add(getCellString(cell).trim()));

            // Require “email”
            int emailIndex = headers.indexOf("email");
            if (emailIndex < 0) {
                throw new IllegalArgumentException("Excel must contain a column named 'email'");
            }

            while (rowIterator.hasNext()) {
                Row row = rowIterator.next();
                Map<String, String> rowData = new HashMap<>();

                for (int i = 0; i < headers.size(); i++) {
                    Cell cell = row.getCell(i, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    rowData.put(headers.get(i), getCellString(cell));
                }

                String to = rowData.get("email");
                if (to == null || to.isBlank()) {
                    log.warn("Skipping row without 'email' value: {}", row.getRowNum());
                    continue;
                }

                String subject = applyTemplate(subjectTemplate, rowData);
                String body = applyTemplate(bodyTemplate, rowData);

                log.info("📧 (Legacy) Sending to {}", to);
                graphMailService.sendMail(to, "", "", subject, body, Collections.emptyList());

                // delay
                safeDelay(2000);
            }
        }
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
        try (ByteArrayInputStream in = new ByteArrayInputStream(data);
             Workbook workbook = WorkbookFactory.create(in)) {

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

            // For each data row
            while (iterator.hasNext()) {
                Row row = iterator.next();
                Map<String, String> rowData = new HashMap<>();
                for (int i = 0; i < headers.size(); i++) {
                    Cell cell = row.getCell(i);
                    rowData.put(headers.get(i), cell != null ? cell.toString() : "");
                }

                // Replace {{placeholders}}
                java.util.function.Function<String, String> replace = (template) -> {
                    if (template == null) return "";
                    String out = template;
                    for (var e : rowData.entrySet()) {
                        out = out.replaceAll("\\{\\{\\s*" + e.getKey() + "\\s*\\}\\}", Matcher.quoteReplacement(e.getValue()));
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

                log.info("Sending email to={} cc={} bcc={} subject={} attachments={}",
                    to, cc, bcc, subject, attachList.size());

                // ⬇️ IMPORTANT: Let GraphMailService handle retry internally
                graphMailService.sendMail(to, cc, bcc, subject, body, attachList);

                // Optional delay to prevent triggering throttling too fast
                safeDelay(1000);
            }
        }
    }

    private String getCellString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                ? cell.getDateCellValue().toString()
                : Double.toString(cell.getNumericCellValue());
            case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            default -> "";
        };
    }

    private String applyTemplate(String template, Map<String, String> rowData) {
        if (template == null) return "";
        Pattern pattern = Pattern.compile("\\{\\{\\s*(\\w+)\\s*\\}\\}");
        Matcher matcher = pattern.matcher(template);
        StringBuilder sb = new StringBuilder();

        while (matcher.find()) {
            String key = matcher.group(1);
            String value = rowData.getOrDefault(key, "");
            matcher.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /** Utility: short sleep between sends **/
    private void safeDelay(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ignored) {}
    }
}
