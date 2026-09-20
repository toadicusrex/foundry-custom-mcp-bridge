import { z } from "zod";

const jsonRecord = z.record(z.any());
const backupOptionsSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().optional()
});

const actorCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("npc"),
  folderId: z.string().optional(),
  img: z.string().optional(),
  system: jsonRecord.default({}),
  prototypeToken: jsonRecord.optional(),
  items: z.array(jsonRecord).optional(),
  ownership: jsonRecord.optional(),
  backup: backupOptionsSchema.optional()
});

const actorUpdateSchema = z.object({
  actorId: z.string().min(1),
  updates: jsonRecord,
  backup: backupOptionsSchema.optional()
});

const actorReplaceItemsSchema = z.object({
  actorId: z.string().min(1),
  items: z.array(jsonRecord),
  backup: backupOptionsSchema.optional()
});

const actorPrototypeTokenSchema = z.object({
  actorId: z.string().min(1),
  updates: jsonRecord,
  backup: backupOptionsSchema.optional()
});

const documentRefSchema = z.object({
  collection: z.string().min(1),
  documentId: z.string().min(1)
});

const createDocumentSchema = z.object({
  collection: z.string().min(1),
  data: jsonRecord,
  backup: backupOptionsSchema.optional()
});

const updateDocumentSchema = z.object({
  collection: z.string().min(1),
  documentId: z.string().min(1),
  updates: jsonRecord,
  backup: backupOptionsSchema.optional()
});

const deleteDocumentSchema = z.object({
  collection: z.string().min(1),
  documentId: z.string().min(1),
  backup: backupOptionsSchema.optional()
});

const embeddedBaseSchema = z.object({
  parentCollection: z.string().min(1),
  parentId: z.string().min(1),
  embeddedName: z.string().min(1)
});

const createEmbeddedSchema = embeddedBaseSchema.extend({
  documents: z.array(jsonRecord).min(1),
  backup: backupOptionsSchema.optional()
});

const updateEmbeddedSchema = embeddedBaseSchema.extend({
  documents: z.array(jsonRecord).min(1),
  backup: backupOptionsSchema.optional()
});

const deleteEmbeddedSchema = embeddedBaseSchema.extend({
  embeddedIds: z.array(z.string().min(1)).min(1),
  backup: backupOptionsSchema.optional()
});

const listDocumentsSchema = z.object({
  collection: z.string().min(1),
  query: z.string().optional(),
  type: z.string().optional(),
  limit: z.number().int().positive().max(200).optional()
});

const listCompendiumPacksSchema = z.object({
  documentName: z.string().optional()
});

const searchCompendiumSchema = z.object({
  packId: z.string().min(1),
  query: z.string().optional(),
  type: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
});

const getCompendiumEntrySchema = z.object({
  packId: z.string().min(1),
  entryId: z.string().min(1)
});

const importCompendiumEntrySchema = z.object({
  packId: z.string().min(1),
  entryId: z.string().min(1),
  targetCollection: z.string().optional(),
  folderId: z.string().optional(),
  backup: backupOptionsSchema.optional()
});

const upsertJournalTextPageSchema = z.object({
  journalId: z.string().min(1),
  pageId: z.string().optional(),
  pageName: z.string().optional(),
  content: z.string(),
  format: z.enum(["plain-text", "html"]).default("plain-text"),
  append: z.boolean().optional(),
  backup: backupOptionsSchema.optional()
});

const moveDocumentToFolderSchema = z.object({
  collection: z.string().min(1),
  documentId: z.string().min(1),
  folderId: z.string().nullable().optional(),
  validateOnly: z.boolean().optional(),
  backup: backupOptionsSchema.optional()
});

const createFolderSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  parentFolderId: z.string().nullable().optional(),
  color: z.string().optional(),
  sorting: z.enum(["a", "m"]).optional(),
  backup: backupOptionsSchema.optional()
});

const coordinateSchema = z.object({
  x: z.number(),
  y: z.number()
});

const placeTokensSchema = z.object({
  sceneId: z.string().optional(),
  actorIds: z.array(z.string().min(1)).min(1),
  hidden: z.boolean().optional(),
  actorLink: z.boolean().optional(),
  disposition: z.number().int().optional(),
  snapToGrid: z.boolean().optional(),
  collisionPolicy: z.enum(["allow", "warn", "reject"]).optional(),
  validateOnly: z.boolean().optional(),
  placement: z
    .object({
      mode: z.enum(["center", "grid", "coordinates"]).default("center"),
      startX: z.number().optional(),
      startY: z.number().optional(),
      spacingX: z.number().optional(),
      spacingY: z.number().optional(),
      coordinates: z.array(coordinateSchema).optional()
    })
    .optional(),
  backup: backupOptionsSchema.optional()
});

const batchOperationSchema = z.object({
  type: z.enum([
    "createDocument",
    "updateDocument",
    "deleteDocument",
    "createEmbeddedDocuments",
    "updateEmbeddedDocuments",
    "deleteEmbeddedDocuments",
    "moveDocumentToFolder",
    "placeTokens"
  ]),
  args: jsonRecord
});

const batchSchema = z.object({
  operations: z.array(batchOperationSchema).min(1),
  dryRun: z.boolean().optional(),
  stopOnError: z.boolean().optional(),
  backup: backupOptionsSchema.optional()
});

const preflightSchema = z.object({
  operation: z.enum(["placeTokens", "moveDocumentToFolder"]),
  args: jsonRecord
});

const toolSpecs = [
  {
    name: "foundry_custom_mcp_ping",
    description: "Verify that the custom Foundry bridge module is connected.",
    inputSchema: { type: "object", properties: {} },
    destructive: false,
    handler: async (_args, { connector }) => connector.query("foundry-custom-mcp.core.ping", {})
  },
  {
    name: "foundry_custom_mcp_get_capabilities",
    description: "Get bridge capabilities, write mode, and supported document collections.",
    inputSchema: { type: "object", properties: {} },
    destructive: false,
    handler: async (_args, { connector }) =>
      connector.query("foundry-custom-mcp.core.getCapabilities", {})
  },
  {
    name: "foundry_custom_mcp_list_documents",
    description: "List world documents from a supported collection with optional name filtering.",
    inputSchema: {
      type: "object",
      required: ["collection"],
      properties: {
        collection: { type: "string" },
        query: { type: "string" },
        type: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number", minimum: 0 }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.documents.list", listDocumentsSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_get_document",
    description: "Get a world document by collection and ID.",
    inputSchema: {
      type: "object",
      required: ["collection", "documentId"],
      properties: {
        collection: { type: "string" },
        documentId: { type: "string" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.documents.get", documentRefSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_create_document",
    description: "Create a world document in a supported collection.",
    inputSchema: {
      type: "object",
      required: ["collection", "data"],
      properties: {
        collection: { type: "string" },
        data: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.documents.create", createDocumentSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_update_document",
    description: "Update a world document in a supported collection.",
    inputSchema: {
      type: "object",
      required: ["collection", "documentId", "updates"],
      properties: {
        collection: { type: "string" },
        documentId: { type: "string" },
        updates: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.documents.update", updateDocumentSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_delete_document",
    description: "Delete a world document from a supported collection.",
    inputSchema: {
      type: "object",
      required: ["collection", "documentId"],
      properties: {
        collection: { type: "string" },
        documentId: { type: "string" },
        backup: { type: "object" }
      }
    },
    destructive: true,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.documents.delete", deleteDocumentSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_create_embedded_documents",
    description: "Create embedded documents such as actor items or journal pages.",
    inputSchema: {
      type: "object",
      required: ["parentCollection", "parentId", "embeddedName", "documents"],
      properties: {
        parentCollection: { type: "string" },
        parentId: { type: "string" },
        embeddedName: { type: "string" },
        documents: { type: "array" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.embedded.create", createEmbeddedSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_update_embedded_documents",
    description: "Update embedded documents such as actor items or journal pages.",
    inputSchema: {
      type: "object",
      required: ["parentCollection", "parentId", "embeddedName", "documents"],
      properties: {
        parentCollection: { type: "string" },
        parentId: { type: "string" },
        embeddedName: { type: "string" },
        documents: { type: "array" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.embedded.update", updateEmbeddedSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_delete_embedded_documents",
    description: "Delete embedded documents by ID from a supported parent document.",
    inputSchema: {
      type: "object",
      required: ["parentCollection", "parentId", "embeddedName", "embeddedIds"],
      properties: {
        parentCollection: { type: "string" },
        parentId: { type: "string" },
        embeddedName: { type: "string" },
        embeddedIds: { type: "array" },
        backup: { type: "object" }
      }
    },
    destructive: true,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.embedded.delete", deleteEmbeddedSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_create_folder",
    description: "Create a folder for a specific Foundry document type.",
    inputSchema: {
      type: "object",
      required: ["name", "type"],
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        parentFolderId: { type: "string" },
        color: { type: "string" },
        sorting: { type: "string" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.folders.create", createFolderSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_move_document_to_folder",
    description: "Move an existing document into a folder or clear its folder assignment.",
    inputSchema: {
      type: "object",
      required: ["collection", "documentId"],
      properties: {
        collection: { type: "string" },
        documentId: { type: "string" },
        folderId: { type: "string" },
        validateOnly: { type: "boolean" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.folders.moveDocument", moveDocumentToFolderSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_preflight",
    description: "Run a targeted preflight validation for a risky operation without applying it.",
    inputSchema: {
      type: "object",
      required: ["operation", "args"],
      properties: {
        operation: { type: "string" },
        args: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.core.preflight", preflightSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_list_compendium_packs",
    description: "List available compendium packs with optional document type filtering.",
    inputSchema: { type: "object", properties: { documentName: { type: "string" } } },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.compendium.listPacks", listCompendiumPacksSchema.parse(args ?? {}))
  },
  {
    name: "foundry_custom_mcp_search_compendium",
    description: "Search entries within a compendium pack by name.",
    inputSchema: {
      type: "object",
      required: ["packId"],
      properties: {
        packId: { type: "string" },
        query: { type: "string" },
        type: { type: "string" },
        limit: { type: "number" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.compendium.search", searchCompendiumSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_get_compendium_entry",
    description: "Read a compendium entry by pack and entry ID.",
    inputSchema: {
      type: "object",
      required: ["packId", "entryId"],
      properties: {
        packId: { type: "string" },
        entryId: { type: "string" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.compendium.getEntry", getCompendiumEntrySchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_import_compendium_entry",
    description: "Import a compendium entry into the world.",
    inputSchema: {
      type: "object",
      required: ["packId", "entryId"],
      properties: {
        packId: { type: "string" },
        entryId: { type: "string" },
        targetCollection: { type: "string" },
        folderId: { type: "string" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.compendium.importEntry", importCompendiumEntrySchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_upsert_journal_text_page",
    description: "Create or update a journal text page using safe plain-text or HTML content.",
    inputSchema: {
      type: "object",
      required: ["journalId", "content"],
      properties: {
        journalId: { type: "string" },
        pageId: { type: "string" },
        pageName: { type: "string" },
        content: { type: "string" },
        format: { type: "string" },
        append: { type: "boolean" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.journals.upsertTextPage", upsertJournalTextPageSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_batch",
    description: "Validate or execute multiple document operations as a batch.",
    inputSchema: {
      type: "object",
      required: ["operations"],
      properties: {
        operations: { type: "array" },
        dryRun: { type: "boolean" },
        stopOnError: { type: "boolean" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.batch.execute", batchSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_place_tokens",
    description: "Place one or more actor tokens onto a scene with center, grid, or explicit coordinates.",
    inputSchema: {
      type: "object",
      required: ["actorIds"],
      properties: {
        sceneId: { type: "string" },
        actorIds: { type: "array" },
        hidden: { type: "boolean" },
        actorLink: { type: "boolean" },
        disposition: { type: "number" },
        snapToGrid: { type: "boolean" },
        collisionPolicy: { type: "string" },
        validateOnly: { type: "boolean" },
        placement: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.scenes.placeTokens", placeTokensSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_find_actors",
    description: "Find actors in the current world by name substring.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        type: { type: "string" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.find", {
        query: typeof args?.query === "string" ? args.query : "",
        type: typeof args?.type === "string" ? args.type : undefined
      })
  },
  {
    name: "foundry_custom_mcp_get_actor",
    description: "Get a world actor by ID with embedded items and prototype token data.",
    inputSchema: {
      type: "object",
      required: ["actorId"],
      properties: {
        actorId: { type: "string" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.get", {
        actorId: z.object({ actorId: z.string().min(1) }).parse(args).actorId
      })
  },
  {
    name: "foundry_custom_mcp_create_actor",
    description: "Create a world actor from raw Foundry document data.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        folderId: { type: "string" },
        img: { type: "string" },
        system: { type: "object" },
        prototypeToken: { type: "object" },
        items: { type: "array" },
        ownership: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.create", actorCreateSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_update_actor",
    description: "Apply an arbitrary update payload to an existing actor document.",
    inputSchema: {
      type: "object",
      required: ["actorId", "updates"],
      properties: {
        actorId: { type: "string" },
        updates: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.update", actorUpdateSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_replace_actor_items",
    description: "Replace all embedded items on an actor with the provided item payloads.",
    inputSchema: {
      type: "object",
      required: ["actorId", "items"],
      properties: {
        actorId: { type: "string" },
        items: { type: "array" },
        backup: { type: "object" }
      }
    },
    destructive: true,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.replaceItems", actorReplaceItemsSchema.parse(args))
  },
  {
    name: "foundry_custom_mcp_update_prototype_token",
    description: "Apply an arbitrary update payload to an actor's prototype token.",
    inputSchema: {
      type: "object",
      required: ["actorId", "updates"],
      properties: {
        actorId: { type: "string" },
        updates: { type: "object" },
        backup: { type: "object" }
      }
    },
    destructive: false,
    handler: async (args, { connector }) =>
      connector.query("foundry-custom-mcp.actors.updatePrototypeToken", actorPrototypeTokenSchema.parse(args))
  }
];

export function listTools() {
  return toolSpecs.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }));
}

function maybeBackupOptions(args) {
  const backup = args?.backup;
  return backup?.enabled ? backup : null;
}

export async function callTool(name, args, context) {
  const tool = toolSpecs.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const timestamp = new Date().toISOString();
  try {
    const result = await tool.handler(args, context);
    let backupPath = null;
    const backup = maybeBackupOptions(args);
    if (backup) {
      backupPath = await context.audit.writeBackup({
        toolName: name,
        label: backup.label,
        payload: { tool: name, args, result }
      });
    }
    await context.audit.appendAudit({
      timestamp,
      tool: name,
      destructive: tool.destructive,
      success: true,
      args,
      backupPath
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ result, backupPath }, null, 2)
        }
      ]
    };
  } catch (error) {
    await context.audit.appendAudit({
      timestamp,
      tool: name,
      destructive: tool.destructive,
      success: false,
      args,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
