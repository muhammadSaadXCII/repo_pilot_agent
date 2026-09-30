import 'dotenv/config';
import envSchema from '../schemas/env_schema.ts';

const env = envSchema.parse(process.env);

export default env;