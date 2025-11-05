package mailmerge.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import mailmerge.service.GraphMailService;
import org.apache.poi.ss.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MailMergeService {

    private static final Logger log = LoggerFactory.getLogger(MailMergeService.class);

    private final GraphMailService graphMailService;

    public MailMergeService(GraphMailService graphMailService) {
        this.graphMailService = graphMailService;
    }

    /**
     * Reads an Excel file, uses first row as headers, and for each row:
     *  - builds a map of {columnName -> value}
     *  - fills subject/body templates (e.g. "Hi {{name}}")
     *  - sends an email to the "email" column
     */
    public void sendMailMerge(MultipartFile file, String subjectTemplate, String bodyTemplate) throws IOException {
        try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
            Sheet sheet = workbook.getSheetAt(0); // first sheet

            Iterator<Row> rowIterator = sheet.iterator();
            if (!rowIterator.hasNext()) {
                log.warn("Excel file is empty");
                return;
            }

            // First row = header
            Row headerRow = rowIterator.next();
            List<String> headers = new ArrayList<>();
            headerRow.forEach(cell -> headers.add(getCellString(cell).trim()));

            // We expect an "email" column
            int emailIndex = headers.indexOf("email");
            if (emailIndex < 0) {
                throw new IllegalArgumentException("Excel must contain a column named 'email'");
            }

            // Process each data row
            while (rowIterator.hasNext()) {
                Row row = rowIterator.next();
                Map<String, String> rowData = new HashMap<>();

                for (int i = 0; i < headers.size(); i++) {
                    Cell cell = row.getCell(i, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    String header = headers.get(i);
                    String value = getCellString(cell);
                    rowData.put(header, value);
                }

                String to = rowData.get("email");
                if (to == null || to.isBlank()) {
                    log.warn("Skipping row without 'email' value: {}", row.getRowNum());
                    continue;
                }

                String subject = applyTemplate(subjectTemplate, rowData);
                String body = applyTemplate(bodyTemplate, rowData);

                log.info("Sending mail merge row {} to {}", row.getRowNum(), to);
                graphMailService.sendMail(to, subject, body);
            }
        }
    }

    private String getCellString(Cell cell) {
        if (cell == null) {
            return "";
        }
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getDateCellValue().toString();
                }
                yield Double.toString(cell.getNumericCellValue());
            }
            case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            case BLANK, _NONE, ERROR -> "";
        };
    }

    /**
     * Replaces {{field}} placeholders with values from rowData.
     * Example: "Hi {{name}}" with rowData "name" -> "Jack"
     */
    private String applyTemplate(String template, Map<String, String> rowData) {
        if (template == null) {
            return "";
        }

        Pattern pattern = Pattern.compile("\\{\\{\\s*(\\w+)\\s*\\}\\}");
        Matcher matcher = pattern.matcher(template);
        StringBuffer sb = new StringBuffer();

        while (matcher.find()) {
            String key = matcher.group(1);
            String value = rowData.getOrDefault(key, "");
            matcher.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }
}
