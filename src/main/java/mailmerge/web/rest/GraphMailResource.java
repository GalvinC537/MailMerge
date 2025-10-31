
//REST controller — exposes /api/graph/send-test-email endpoint for the frontend


package mailmerge.web.rest;

import mailmerge.service.GraphMailService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/graph")
public class GraphMailResource {

    private final GraphMailService graphMailService;

    public GraphMailResource(GraphMailService graphMailService) {
        this.graphMailService = graphMailService;
    }

    /**
     * POST /api/graph/send-test-email : Sends a hardcoded email to your inbox.
     */
    @PostMapping("/send-test-email")
    public ResponseEntity<Void> sendTestEmail(Authentication authentication) {
        // Replace this with your email for testing
        String myEmail = "Lin1@hotmail.co.uk";
        graphMailService.sendTestEmail(myEmail);
        return ResponseEntity.noContent().build();
    }
}

