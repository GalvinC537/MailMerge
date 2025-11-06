// Called from project.service.ts and then calls MailMergeService.java

package mailmerge.web.rest;

import mailmerge.service.MailMergeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/mail-merge")
public class MailMergeResource {

    private final Logger log = LoggerFactory.getLogger(MailMergeResource.class);
    private final MailMergeService mailMergeService;

    public MailMergeResource(MailMergeService mailMergeService) {
        this.mailMergeService = mailMergeService;
    }

    /**
     * Expects multipart/form-data:
     *  - file: Excel file (.xlsx)
     *  - subjectTemplate: String (e.g. "Hello {{name}}")
     *  - bodyTemplate: String (e.g. "Dear {{name}}, your course is {{course}}")
     */
    @PostMapping("/send")
    public ResponseEntity<Void> sendMailMerge(
        @RequestPart("file") MultipartFile file,
        @RequestPart("subjectTemplate") String subjectTemplate,
        @RequestPart("bodyTemplate") String bodyTemplate
    ) throws Exception {
        log.debug("REST request to send mail merge using file: {}", file.getOriginalFilename());
        mailMergeService.sendMailMerge(file, subjectTemplate, bodyTemplate);
        return ResponseEntity.ok().build();
    }
}
