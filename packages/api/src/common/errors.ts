// Typed error hierarchy. A service throws one of these to signal a domain outcome; a resolver
// that lists the matching type in `errors: { types: [...] }` surfaces it to the client as a
// result-union member (see builder.ts). Each carries an HTTP-style `status` and a default
// `message`, plus optional structured `data`.

type ErrorData = Record<string, unknown>;

export class ServerError<Data = ErrorData> extends Error {
  public status: number;
  public data?: Data;

  constructor(message?: string, data?: Data) {
    super(message ?? 'Server error');
    this.name = 'ServerError';
    this.status = 500;
    this.data = data;
  }
}

export class BadRequestError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Bad request', data);
    this.status = 400;
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Unauthorized', data);
    this.status = 401;
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Forbidden', data);
    this.status = 403;
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Not found', data);
    this.status = 404;
    this.name = 'NotFoundError';
  }
}

export class ConflictError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Conflict', data);
    this.status = 409;
    this.name = 'ConflictError';
  }
}

export class PayloadTooLargeError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Payload too large', data);
    this.status = 413;
    this.name = 'PayloadTooLargeError';
  }
}

export class ValidationError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Unprocessable entity', data);
    this.status = 422;
    this.name = 'ValidationError';
  }
}

export class ServiceUnavailableError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Service unavailable', data);
    this.status = 503;
    this.name = 'ServiceUnavailableError';
  }
}

export class TooManyRequestsError<Data = ErrorData> extends ServerError<Data> {
  constructor(message?: string, data?: Data) {
    super(message ?? 'Too many requests', data);
    this.status = 429;
    this.name = 'TooManyRequestsError';
  }
}
