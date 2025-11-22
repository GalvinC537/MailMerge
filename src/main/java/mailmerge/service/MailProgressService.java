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

    private static final Logger log = LoggerFactory.getLogger(MailProgressService.class);

    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter registerClient() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout

        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        log.info("✅ SSE client registered, total clients={}", emitters.size());
        return emitter;
    }

    public void sendProgress(MailProgressEvent event) {
        log.info("📡 Broadcasting progress: email={} success={} {}/{} msg={}",
            event.email, event.success, event.sentCount, event.totalCount, event.message);

        List<SseEmitter> deadEmitters = new ArrayList<>();

        emitters.forEach(emitter -> {
            try {
                emitter.send(
                    SseEmitter.event()
                        .name("mail-progress") // custom event name
                        .data(event)
                );
            } catch (IOException e) {
                log.warn("❌ Failed to send SSE to a client, removing emitter", e);
                emitter.complete();
                deadEmitters.add(emitter);
            }
        });

        emitters.removeAll(deadEmitters);
    }
}
