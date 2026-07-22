import 'dotenv/config';
import { bootstrapTls } from './tls-bootstrap';

/** Run before any Supabase outbound call (import this module first). */
bootstrapTls();
