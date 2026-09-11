package com.reverie.observability;

import java.util.Map;

/**
 * Everything Reverie's backend is willing to tell an observability provider
 * about a fault, and nothing else.
 *
 * <p>A type rather than a pile of arguments, so that "what leaves this server"
 * is a thing that can be read, reviewed and asserted on in one place. Widening
 * it is a privacy decision; see {@link SentryErrorReporter#describe}.
 *
 * @param message a fixed, generic label — never the exception's own message
 * @param tags short opaque strings only: a service name, class names, and an
 *     identifier this server generated
 */
public record SafeErrorEvent(String message, Map<String, String> tags) {
}
