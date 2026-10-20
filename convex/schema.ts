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
    /**
     * Rôle : absent pour un joueur. « admin » (un seul, attribué en ligne de commande)
     * accède à l'interface admin ; « moderator » modère le chat depuis le jeu.
     */
    role: v.optional(v.union(v.literal('admin'), v.literal('moderator'))),
    /** Langue choisie (code de src/data/languages.ts). */
    language: v.optional(v.string()),
    /** Ne peut plus écrire dans le chat jusqu'à cette date. */
    mutedUntil: v.optional(v.number()),
  })
    .index('by_pseudoKey', ['pseudoKey'])
    .index('by_xp', ['xp'])
    .index('by_population', ['population'])
    .index('by_lastSeen', ['lastSeenAt'])
    .index('by_createdAt', ['createdAt'])
    .index('by_role', ['role']),

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
    /** Message du chat signalé. */
    messageId: v.optional(v.id('chatMessages')),
  })
    .index('by_resolved', ['resolved', 'createdAt'])
    .index('by_reporter', ['reporterId'])
    .index('by_target', ['targetId']),

  /** Lots de marchandises mis en vente sur le marché. */
  listings: defineTable({
    sellerId: v.id('players'),
    /** Produit du lot (absent : lot d'avant les produits, compté comme du blé). */
    item: v.optional(v.string()),
    qty: v.number(),
    unitPrice: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(v.literal('open'), v.literal('sold'), v.literal('cancelled'), v.literal('expired')),
    buyerId: v.optional(v.id('players')),
    soldAt: v.optional(v.number()),
    /** Le vendeur a récupéré ses pièces (ou ses produits si invendu). */
    settled: v.boolean(),
  })
    .index('by_status_price', ['status', 'unitPrice'])
    .index('by_seller', ['sellerId', 'settled'])
    .index('by_buyer', ['buyerId']),

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

  /** Chat : salon mondial (« world ») ou d'une langue (« lang:fr »), annonces de l'équipe. */
  chatMessages: defineTable({
    channel: v.string(),
    playerId: v.id('players'),
    /** Pseudo, rôle et niveau au moment de l'envoi. */
    pseudo: v.string(),
    role: v.optional(v.union(v.literal('admin'), v.literal('moderator'))),
    level: v.number(),
    text: v.string(),
    createdAt: v.number(),
    kind: v.union(v.literal('message'), v.literal('announcement')),
    /** Retiré par son auteur ou par un modérateur (gardé pour l'examen des signalements). */
    deleted: v.optional(v.boolean()),
  })
    .index('by_channel', ['channel', 'createdAt'])
    .index('by_player', ['playerId', 'createdAt'])
    .index('by_kind', ['kind', 'createdAt'])
    .index('by_createdAt', ['createdAt']),

  /** Évènements de jeu notables (objectifs terminés, niveaux…) pour l'entonnoir. */
  events: defineTable({
    playerId: v.id('players'),
    type: v.string(),
    name: v.string(),
    at: v.number(),
  })
    .index('by_at', ['at'])
    .index('by_player', ['playerId']),

  /** Abonnements Web Push (navigateur ou appli web installée sur l'écran d'accueil). */
  pushSubscriptions: defineTable({
    playerId: v.id('players'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index('by_player', ['playerId'])
    .index('by_endpoint', ['endpoint']),

  /** Notifications programmées (« vos fraises sont prêtes ») : une tâche planifiée chacune. */
  pushJobs: defineTable({
    playerId: v.id('players'),
    at: v.number(),
    title: v.string(),
    body: v.string(),
    scheduledId: v.optional(v.id('_scheduled_functions')),
  }).index('by_player', ['playerId']),

  /** Clés VAPID du serveur, créées au premier besoin (la clé privée ne quitte jamais le serveur). */
  pushKeys: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
  }),

  /** Demandes aux voisins : « j'ai besoin de 20 lait ». Une demande ouverte par joueur. */
  requests: defineTable({
    playerId: v.id('players'),
    item: v.string(),
    qty: v.number(),
    /** Unités reçues des voisins / déjà récupérées par le demandeur. */
    received: v.number(),
    claimed: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index('by_player', ['playerId', 'createdAt']),

  /** « J'aime » donnés aux villes visitées (concours de la plus belle ville, par semaine). */
  likes: defineTable({
    fromId: v.id('players'),
    toId: v.id('players'),
    week: v.string(),
  }).index('by_from_to_week', ['fromId', 'toId', 'week']),

  likeCounts: defineTable({
    playerId: v.id('players'),
    week: v.string(),
    count: v.number(),
  })
    .index('by_player_week', ['playerId', 'week'])
    .index('by_week_count', ['week', 'count']),

  /** Défi de quartier : récoltes de tous les joueurs pendant la semaine. */
  communityWeeks: defineTable({
    week: v.string(),
    total: v.number(),
    contributors: v.number(),
  }).index('by_week', ['week']),

  communityContributions: defineTable({
    week: v.string(),
    playerId: v.id('players'),
    amount: v.number(),
    claimed: v.boolean(),
  })
    .index('by_week_player', ['week', 'playerId'])
    .index('by_player', ['playerId']),
});
