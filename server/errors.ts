/** Error con código HTTP para propagarlo limpio hasta el middleware de errores. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'bad_request', details);
  }

  static unauthorized(message = 'Necesitas iniciar sesión') {
    return new HttpError(401, message, 'unauthorized');
  }

  static forbidden(message: string) {
    return new HttpError(403, message, 'forbidden');
  }

  static notFound(message = 'Recurso no encontrado') {
    return new HttpError(404, message, 'not_found');
  }

  static conflict(message: string) {
    return new HttpError(409, message, 'conflict');
  }

  static tooManyRequests(message: string) {
    return new HttpError(429, message, 'rate_limited');
  }

  static upstream(message: string, details?: unknown) {
    return new HttpError(502, message, 'upstream_error', details);
  }

  /** El proveedor rechazó la clave (401/403): reintentar no va a arreglarlo. */
  static invalidCredentials(message: string, details?: unknown) {
    return new HttpError(502, message, 'invalid_credentials', details);
  }
}
