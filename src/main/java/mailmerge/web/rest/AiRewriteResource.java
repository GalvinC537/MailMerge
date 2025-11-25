package mailmerge.web.rest;

import mailmerge.service.AiRewriteService;
import mailmerge.service.dto.AIRewriteRequest;
import mailmerge.service.dto.AIRewriteResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai")
public class AiRewriteResource {

    private final AiRewriteService aiRewriteService;

    public AiRewriteResource(AiRewriteService aiRewriteService) {
        this.aiRewriteService = aiRewriteService;
    }

    @PostMapping("/rewrite")
    public ResponseEntity<AIRewriteResponse> rewrite(@RequestBody AIRewriteRequest request) {
        AIRewriteResponse resp = aiRewriteService.rewrite(
            request.getOriginalText(),
            request.getTone()
        );
        return ResponseEntity.ok(resp);
    }
}
