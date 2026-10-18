import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Base de données du jeu. La ville elle-même reste calculée sur l'appareil ;
 * le serveur garde la dernière sauvegarde, l'identité (pseudo), le social et
 * les mesures d'audience.
 */
export default defineSchema({
  players: defineTable({
    pseudo: v.string(),
    /** Pseudo normalisé (sans casse ni accents) pour l'unicité. */
    pseudoKey: v.string(),
    cityName: v.string(),
    level: v.number(),
    xp: v.number(),
    population: v.number(),
    createdAt: v.number(),
    /** Jour d'inscription (AAAA-MM-JJ, UTC) : cohortes de rétention. */
    createdDay: v.string(),
    lastSeenAt: v.number(),
    banned: v.optional(v.boolean()),
    /** Sauvegardes à la progression invraisemblable (à examiner dans l'admin). */
    suspicious: v.optional(v.number()),
  })
    .index('by_pseudoKey', ['pseudoKey'])
    .index('by_xp', ['xp'])
    .index('by_population', ['population'])
    .index('by_lastSeen', ['lastSeenAt'])
    .index('by_createdAt', ['createdAt']),

  /** Une clé secrète par appareil (seule son empreinte est stockée). */
  devices: defineTable({
    playerId: v.id('players'),
    tokenHash: v.string(),
    createdAt: v.number(),
    platform: v.string(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_player', ['playerId']),

  /** Codes à usage unique pour retrouver sa ville sur un autre appareil. */
  transferCodes: defineTable({
    playerId: v.id('players'),
    codeHash: v.string(),
    expiresAt: v.number(),
  })
    .index('by_codeHash', ['codeHash'])
    .index('by_player', ['playerId']),

  saves: defineTable({
    playerId: v.id('players'),
    revision: v.number(),
    savedAt: v.number(),
    /** Sauvegarde sérialisée (format de src/core/save.ts). */
    data: v.string(),
  }).index('by_player', ['playerId']),

  neighbors: defineTable({
    playerId: v.id('players'),
    neighborId: v.id('players'),
    createdAt: v.number(),
  })
    .index('by_player', ['playerId', 'createdAt'])
    .index('by_neighbor', ['neighborId'])
    .index('by_pair', ['playerId', 'neighborId']),

  helps: defineTable({
    fromId: v.id('players'),
    toId: v.id('players'),
    day: v.string(),
    createdAt: v.number(),
    claimed: v.boolean(),
  })
    .index('by_from_to_day', ['fromId', 'toId', 'day'])
    .index('by_to_claimed', ['toId', 'claimed'])
    .index('by_from', ['fromId']),

  blocks: defineTable({
    playerId: v.id('players'),
    blockedId: v.id('players'),
  })
    .index('by_player', ['playerId'])
    .index('by_blocked', ['blockedId'])
    .index('by_pair', ['playerId', 'blockedId']),

  reports: defineTable({
    reporterId: v.id('players'),
    targetId: v.id('players'),
    reason: v.string(),
    createdAt: v.number(),
    resolved: v.boolean(),
  })
    .index('by_resolved', ['resolved', 'createdAt'])
    .index('by_reporter', ['reporterId'])
    .index('by_target', ['targetId']),

  /** Sessions de jeu (prolongées par un signal régulier de l'appli). */
  sessions: defineTable({
    playerId: v.id('players'),
    clientSessionId: v.string(),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    day: v.string(),
    platform: v.string(),
  })
    .index('by_client', ['clientSessionId'])
    .index('by_started', ['startedAt'])
    .index('by_player', ['playerId', 'startedAt']),

  /** Évènements de jeu notables (objectifs terminés, niveaux…) pour l'entonnoir. */
  events: defineTable({
    playerId: v.id('players'),
    type: v.string(),
    name: v.string(),
    at: v.number(),
  })
    .index('by_at', ['at'])
    .index('by_player', ['playerId']),
});
