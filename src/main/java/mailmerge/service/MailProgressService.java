package mailmerge.service;

import mailmerge.service.dto.MailProgressEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class MailProgressService {

    // =========================================================================
    // Logging
    // =========================================================================

    // eslint-disable-next-line @typescript-eslint/member-ordering
    private static final Logger log = LoggerFactory.getLogger(MailProgressService.class);

    // =========================================================================
    // SSE client registry
    // =========================================================================

    /**
     * Thread-safe emitter list.
     * CopyOnWriteArrayList is safe for:
     *  - frequent iteration (broadcasts)
     *  - occasional add/remove (client connect/disconnect)
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Register an SSE client and keep the connection open indefinitely.
     * The controller should return this emitter directly.
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public SseEmitter registerClient() {
        // 0L = no timeout (caller controls lifecycle; browser disconnect triggers cleanup handlers)
        SseEmitter emitter = new SseEmitter(0L);

        // Track this client so we can broadcast events to them
        emitters.add(emitter);

        // Cleanup on any termination path
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        log.info("✅ SSE client registered, total clients={}", emitters.size());
        return emitter;
    }

    /**
     * Broadcast a progress event to all active SSE clients.
     * Removes dead emitters that throw IOExceptions (client disconnected).
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public void sendProgress(MailProgressEvent event) {
        if (event == null) return;

        // Useful for debugging: shows what we broadcast and the "row progress" counters
        log.info("📡 Broadcasting progress: email={} success={} {}/{} msg={}",
            event.email, event.success, event.sentCount, event.totalCount, event.message);

        // Collect dead emitters separately to avoid modifying the list while iterating
        List<SseEmitter> deadEmitters = new ArrayList<>();

        emitters.forEach(emitter -> {
            try {
                // Send a named SSE event so the frontend can listen to "mail-progress"
                emitter.send(
                    SseEmitter.event()
                        .name("mail-progress")
                        .data(event)
                );
            } catch (IOException e) {
                // IOException usually means the client disconnected or network broke
                log.warn("❌ Failed to send SSE to a client, removing emitter", e);
                emitter.complete(); // close cleanly
                deadEmitters.add(emitter);
            }
        });

        // Remove all emitters that failed during this broadcast
        emitters.removeAll(deadEmitters);
    }
}
