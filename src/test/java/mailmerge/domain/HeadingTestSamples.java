package mailmerge.domain;

import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

public class HeadingTestSamples {

    private static final Random random = new Random();
    private static final AtomicLong longCount = new AtomicLong(random.nextInt() + (2 * Integer.MAX_VALUE));

    public static Heading getHeadingSample1() {
        return new Heading().id(1L).name("name1");
    }

    public static Heading getHeadingSample2() {
        return new Heading().id(2L).name("name2");
    }

    public static Heading getHeadingRandomSampleGenerator() {
        return new Heading().id(longCount.incrementAndGet()).name(UUID.randomUUID().toString());
    }
}
