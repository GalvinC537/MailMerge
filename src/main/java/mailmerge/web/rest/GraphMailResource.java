package mailmerge.web.rest;

import mailmerge.service.GraphMailService;
import mailmerge.service.dto.GraphMailDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/graph-mail")
public class GraphMailResource {

    private final Logger log = LoggerFactory.getLogger(GraphMailResource.class);
    private final GraphMailService graphMailService;

    public GraphMailResource(GraphMailService graphMailService) {
        this.graphMailService = graphMailService;
    }

    @PostMapping("/send")
    public ResponseEntity<Void> sendMail(@RequestBody GraphMailDTO mailRequest) {
        log.debug("REST request to send email via Graph API: {}", mailRequest);

        graphMailService.sendMail(
            mailRequest.getTo(),
            mailRequest.getCc(),
            mailRequest.getBcc(),
            mailRequest.getSubject(),
            mailRequest.getBody(),
            mailRequest.getAttachments()
        );

        return ResponseEntity.ok().build();
    }
}
