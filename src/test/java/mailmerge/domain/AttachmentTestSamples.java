package mailmerge.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

public class AttachmentTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    public static Attachment getAttachmentSample1() {
        return new Attachment().id(1L).fileContentType("fileContentType1").name("name1").size(1L);
    }

    public static Attachment getAttachmentSample2() {
        return new Attachment().id(2L).fileContentType("fileContentType2").name("name2").size(2L);
    }

    public static Attachment getAttachmentRandomSampleGenerator() {
        return new Attachment()
            .id(longCount.incrementAndGet())
            .fileContentType(UUID.randomUUID().toString())
            .name(UUID.randomUUID().toString())
            .size(longCount.incrementAndGet());
    }
}
