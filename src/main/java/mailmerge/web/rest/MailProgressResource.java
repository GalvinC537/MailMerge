package mailmerge.web.rest;

import mailmerge.service.MailProgressService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class MailProgressResource {

    private final MailProgressService progressService;

    public MailProgressResource(MailProgressService progressService) {
        this.progressService = progressService;
    }

    @GetMapping("/api/mail-progress/stream")
    public SseEmitter streamProgress() {
        return progressService.registerClient();
    }
}
