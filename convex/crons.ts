import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

/** Chaque nuit : les messages du chat de plus de 30 jours sont effacés. */
crons.daily('purge du chat', { hourUTC: 3, minuteUTC: 17 }, internal.chat.purge, {});

export default crons;
