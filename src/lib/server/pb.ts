import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$env/static/private';

export const createPb = () => new PocketBase(POCKETBASE_URL);
