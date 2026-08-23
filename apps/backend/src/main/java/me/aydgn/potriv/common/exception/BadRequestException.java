package me.aydgn.potriv.common.exception;

public class BadRequestException extends RuntimeException {

    /**
     * A stable identifier for clients, or null when the message is the whole
     * story. See {@link ErrorCodes} for why this is not optional for anything
     * a caller branches on.
     */
    private final String code;

    public BadRequestException(String message) {
        this(message, null);
    }

    public BadRequestException(String message, String code) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
