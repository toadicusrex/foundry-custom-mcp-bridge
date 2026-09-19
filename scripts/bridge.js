const MODULE_ID = "foundry-custom-mcp-bridge";
const DEFAULT_SERVER_URL = "ws://127.0.0.1:47811/foundry-custom-mcp";
const WRITE_MODES = {
  READ_ONLY: "read-only",
  ACTOR_WRITE_ONLY: "actor-write-only",
  FULL_WRITE: "full-write"
};
const SUPPORTED_COLLECTIONS = {
  Actor: () => game.actors,
  Item: () => game.items,
  JournalEntry: () => game.journal,
  Scene: () => game.scenes,
  RollTable: () => game.tables,
  Folder: () => game.folders,
  Playlist: () => game.playlists,
  Macro: () => game.macros,
  Cards: () => game.cards
};
const SUPPORTED_EMBEDDED = {
  Actor: new Set(["Item", "ActiveEffect"]),
  JournalEntry: new Set(["JournalEntryPage"]),
  Scene: new Set([
    "Token",
    "AmbientLight",
    "AmbientSound",
    "MeasuredTemplate",
    "Tile",
    "Wall",
    "Drawing",
    "Note",
    "Region"
  ]),
  RollTable: new Set(["TableResult"]),
  Cards: new Set(["Card"])
};

let socket = null;
let reconnectTimer = null;
let connectionStatus = "Disconnected";
let connectionDetail = "The bridge has not connected yet.";
let connectedAt = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "serverUrl", {
    name: "Server URL",
    hint: "WebSocket URL exposed by the custom MCP server.",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_SERVER_URL,
    onChange: () => scheduleReconnect(0)
  });

  game.settings.register(MODULE_ID, "authToken", {
    name: "Auth Token",
    hint: "Optional shared secret appended as a query parameter when connecting.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => scheduleReconnect(0)
  });

  game.settings.register(MODULE_ID, "writeMode", {
    name: "Write Mode",
    hint: "Controls which mutation requests this bridge will accept.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [WRITE_MODES.READ_ONLY]: "Read Only",
      [WRITE_MODES.ACTOR_WRITE_ONLY]: "Actor Write Only",
      [WRITE_MODES.FULL_WRITE]: "Full Write"
    },
    default: WRITE_MODES.ACTOR_WRITE_ONLY
  });

  game.settings.register(MODULE_ID, "allowedCollections", {
    name: "Allowed Collections",
    hint: "Comma-separated collection names this bridge may access. Blank means the built-in supported list.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "connectionTest", {
    name: "Bridge connection",
    hint: "View the live connection state and test the bridge without changing Foundry data.",
    label: "Test connection",
    icon: "fas fa-plug",
    scope: "world",
    config: true,
    restricted: true,
    type: BridgeConnectionTestApplication
  });
});

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  connectBridge();
});

function scheduleReconnect(delayMs = 3000) {
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => connectBridge(), delayMs);
}

function connectBridge({ onOpen, onFailure } = {}) {
  clearTimeout(reconnectTimer);
  if (!game.user?.isGM) return;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close(1000, "Refreshing bridge connection");
  }

  let url;
  try {
    const baseUrl = game.settings.get(MODULE_ID, "serverUrl");
    const authToken = game.settings.get(MODULE_ID, "authToken");
    url = new URL(baseUrl);

    if (authToken) {
      url.searchParams.set("token", authToken);
    }
  } catch (error) {
    setConnectionStatus("Error", `Invalid server URL: ${error instanceof Error ? error.message : String(error)}`);
    onFailure?.();
    return;
  }

  setConnectionStatus("Connecting", `Opening bridge connection to ${url.origin}${url.pathname}.`);
  const activeSocket = new WebSocket(url.toString());
  socket = activeSocket;
  let hasOpened = false;

  activeSocket.addEventListener("open", () => {
    hasOpened = true;
    console.log(`${MODULE_ID} connected`, url.toString());
    setConnectionStatus("Connected", "WebSocket handshake completed; Foundry is ready to receive bridge requests.");
    onOpen?.();
  });

  activeSocket.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message?.type !== "mcp-query" || !message?.id) return;

      const { method, data } = message.data ?? {};
      const result = await dispatch(method, data ?? {});

      socket.send(
        JSON.stringify({
          type: "mcp-response",
          id: message.id,
          data: {
            success: true,
            data: result
          }
        })
      );
    } catch (error) {
      const requestId = safeParseRequestId(event.data);
      socket?.send(
        JSON.stringify({
          type: "mcp-response",
          id: requestId ?? "unknown",
          data: {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }
        })
      );
    }
  });

  activeSocket.addEventListener("close", () => {
    if (socket !== activeSocket) return;
    setConnectionStatus("Disconnected", "Bridge connection closed; retrying automatically in three seconds.");
    if (!hasOpened) onFailure?.();
    scheduleReconnect();
  });

  activeSocket.addEventListener("error", (error) => {
    console.error(`${MODULE_ID} socket error`, error);
    setConnectionStatus("Error", "The bridge WebSocket could not connect. Check the server URL, tunnel, and shared token.");
    if (!hasOpened) onFailure?.();
  });
}

function setConnectionStatus(status, detail) {
  connectionStatus = status;
  connectionDetail = detail;
  if (status === "Connected") connectedAt = new Date().toLocaleString();
}

class BridgeConnectionTestApplication extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-connection-test`,
      title: "Foundry Custom MCP Bridge connection",
      template: `modules/${MODULE_ID}/templates/connection-test.html`,
      width: 500,
      height: "auto",
      closeOnSubmit: false
    });
  }

  getData() {
    return { connectionStatus, connectionDetail, connectedAt };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='test-connection']").on("click", (event) => {
      event.preventDefault();
      setConnectionStatus("Connecting", "Testing bridge connection.");
      connectBridge({
        onOpen: () => {
          ui.notifications.info("Foundry Custom MCP Bridge is connected.");
          this.render(false);
        },
        onFailure: () => {
          ui.notifications.error("Foundry Custom MCP Bridge could not connect. See the status panel for details.");
          this.render(false);
        }
      });
      this.render(false);
    });
  }

  async _updateObject() {}
}

function safeParseRequestId(raw) {
  try {
    return JSON.parse(raw)?.id;
  } catch {
    return null;
  }
}

async function dispatch(method, data) {
  switch (method) {
    case "foundry-custom-mcp.core.ping":
      return {
        ok: true,
        world: game.world?.id,
        system: game.system?.id,
        foundryVersion: game.release?.version,
        writeMode: getWriteMode()
      };

    case "foundry-custom-mcp.core.getCapabilities":
      return getCapabilities();

    case "foundry-custom-mcp.core.preflight":
      return runPreflight(data);

    case "foundry-custom-mcp.documents.list":
      return listDocuments(data);

    case "foundry-custom-mcp.documents.get":
      return getDocument(data.collection, data.documentId);

    case "foundry-custom-mcp.documents.create":
      assertWriteAllowed("document", data.collection);
      return createDocument(data.collection, data.data);

    case "foundry-custom-mcp.documents.update":
      assertWriteAllowed("document", data.collection);
      return updateDocument(data.collection, data.documentId, data.updates);

    case "foundry-custom-mcp.documents.delete":
      assertWriteAllowed("document", data.collection);
      return deleteDocument(data.collection, data.documentId);

    case "foundry-custom-mcp.embedded.create":
      assertWriteAllowed("embedded", data.parentCollection);
      return createEmbeddedDocuments(data.parentCollection, data.parentId, data.embeddedName, data.documents);

    case "foundry-custom-mcp.embedded.update":
      assertWriteAllowed("embedded", data.parentCollection);
      return updateEmbeddedDocuments(data.parentCollection, data.parentId, data.embeddedName, data.documents);

    case "foundry-custom-mcp.embedded.delete":
      assertWriteAllowed("embedded", data.parentCollection);
      return deleteEmbeddedDocuments(data.parentCollection, data.parentId, data.embeddedName, data.embeddedIds);

    case "foundry-custom-mcp.compendium.listPacks":
      return listCompendiumPacks(data);

    case "foundry-custom-mcp.folders.create":
      assertWriteAllowed("document", "Folder");
      return createFolder(data);

    case "foundry-custom-mcp.folders.moveDocument":
      assertWriteAllowed("document", data.collection);
      return moveDocumentToFolder(data);

    case "foundry-custom-mcp.compendium.search":
      return searchCompendium(data);

    case "foundry-custom-mcp.compendium.getEntry":
      return getCompendiumEntry(data.packId, data.entryId);

    case "foundry-custom-mcp.compendium.importEntry":
      assertWriteAllowed("document", data.targetCollection || "Actor");
      return importCompendiumEntry(data);

    case "foundry-custom-mcp.journals.upsertTextPage":
      assertWriteAllowed("embedded", "JournalEntry");
      return upsertJournalTextPage(data);

    case "foundry-custom-mcp.batch.execute":
      return executeBatch(data);

    case "foundry-custom-mcp.scenes.placeTokens":
      assertWriteAllowed("embedded", "Scene");
      return placeTokens(data);

    case "foundry-custom-mcp.actors.find":
      return findActors(data);

    case "foundry-custom-mcp.actors.get":
      return getActor(data.actorId);

    case "foundry-custom-mcp.actors.create":
      assertWriteAllowed("actor", "Actor");
      return createActor(data);

    case "foundry-custom-mcp.actors.update":
      assertWriteAllowed("actor", "Actor");
      return updateActor(data.actorId, data.updates);

    case "foundry-custom-mcp.actors.replaceItems":
      assertWriteAllowed("actor", "Actor");
      return replaceActorItems(data.actorId, data.items);

    case "foundry-custom-mcp.actors.updatePrototypeToken":
      assertWriteAllowed("actor", "Actor");
      return updatePrototypeToken(data.actorId, data.updates);

    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

function getWriteMode() {
  return game.settings.get(MODULE_ID, "writeMode");
}

function getAllowedCollectionNames() {
  const configured = String(game.settings.get(MODULE_ID, "allowedCollections") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (configured.length > 0) {
    return configured.filter((name) => SUPPORTED_COLLECTIONS[name]);
  }
  return Object.keys(SUPPORTED_COLLECTIONS);
}

function getCapabilities() {
  return {
    moduleId: MODULE_ID,
    namespacePrefix: "foundry-custom-mcp",
    writeMode: getWriteMode(),
    supportedCollections: getAllowedCollectionNames(),
    supportedEmbeddedDocuments: Object.fromEntries(
      Object.entries(SUPPORTED_EMBEDDED).map(([key, value]) => [key, [...value]])
    )
  };
}

function assertWriteAllowed(kind, collection) {
  const mode = getWriteMode();
  if (mode === WRITE_MODES.FULL_WRITE) return;

  if (mode === WRITE_MODES.ACTOR_WRITE_ONLY) {
    const actorAllowed =
      kind === "actor" ||
      (kind === "document" && collection === "Actor") ||
      (kind === "embedded" && collection === "Actor");
    if (actorAllowed) return;
  }

  throw new Error(`Write blocked by ${MODULE_ID} mode '${mode}' for ${collection}`);
}

function getCollection(collectionName) {
  if (!getAllowedCollectionNames().includes(collectionName)) {
    throw new Error(`Collection blocked by allowlist: ${collectionName}`);
  }

  const factory = SUPPORTED_COLLECTIONS[collectionName];
  if (!factory) {
    throw new Error(`Unsupported collection: ${collectionName}`);
  }
  const collection = factory();
  if (!collection) {
    throw new Error(`Collection unavailable: ${collectionName}`);
  }
  return collection;
}

function requireDocument(collectionName, documentId) {
  const collection = getCollection(collectionName);
  const document = collection.get(documentId);
  if (!document) {
    throw new Error(`${collectionName} not found: ${documentId}`);
  }
  return document;
}

function assertEmbeddedSupported(parentCollection, embeddedName) {
  const allowed = SUPPORTED_EMBEDDED[parentCollection];
  if (!allowed?.has(embeddedName)) {
    throw new Error(`Unsupported embedded document ${embeddedName} for ${parentCollection}`);
  }
}

function serializeDocument(document) {
  return {
    id: document.id,
    uuid: document.uuid,
    name: document.name ?? null,
    type: document.type ?? null,
    documentName: document.documentName,
    folder: document.folder?.id ?? null,
    data: document.toObject()
  };
}

function serializeActor(actor) {
  return {
    id: actor.id,
    name: actor.name,
    type: actor.type,
    img: actor.img,
    folder: actor.folder?.id ?? null,
    system: actor.toObject().system,
    prototypeToken: actor.prototypeToken?.toObject?.() ?? actor.prototypeToken,
    items: actor.items.map((item) => item.toObject()),
    ownership: actor.ownership
  };
}

function requireActor(actorId) {
  const actor = getCollection("Actor").get(actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${actorId}`);
  }
  return actor;
}

function listDocuments({ collection, query = "", type, limit = 50 } = {}) {
  const lowered = String(query).trim().toLowerCase();
  return [...getCollection(collection)]
    .filter((document) => {
      if (type && document.type !== type) return false;
      if (!lowered) return true;
      return String(document.name ?? "").toLowerCase().includes(lowered);
    })
    .slice(0, limit)
    .map((document) => ({
      id: document.id,
      uuid: document.uuid,
      name: document.name ?? null,
      type: document.type ?? null,
      documentName: document.documentName
    }));
}

function getDocument(collection, documentId) {
  return serializeDocument(requireDocument(collection, documentId));
}

async function createDocument(collection, data) {
  const documentClass = getDocumentClass(collection);
  const created = await documentClass.create(data);
  return serializeDocument(created);
}

async function createFolder({ name, type, parentFolderId = null, color, sorting }) {
  if (!getAllowedCollectionNames().includes(type)) {
    throw new Error(`Folder type blocked by allowlist: ${type}`);
  }
  const folder = await Folder.create({
    name,
    type,
    folder: parentFolderId,
    color,
    sorting
  });
  return serializeDocument(folder);
}

async function moveDocumentToFolder({ collection, documentId, folderId = null }) {
  const document = requireDocument(collection, documentId);
  const validation = validateFolderMove({ collection, documentId, folderId });
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  if (validation.warnings?.length) {
    console.warn(`${MODULE_ID} folder move warnings`, validation.warnings);
  }
  if (validation.validateOnly) {
    return validation;
  }
  if (folderId !== null) {
    const folder = requireDocument("Folder", folderId);
    if (folder.type !== collection) {
      throw new Error(`Folder type mismatch: ${folder.type} cannot contain ${collection}`);
    }
  }
  await document.update({ folder: folderId });
  return serializeDocument(document);
}

async function updateDocument(collection, documentId, updates) {
  const document = requireDocument(collection, documentId);
  await document.update(updates ?? {});
  return serializeDocument(document);
}

async function deleteDocument(collection, documentId) {
  const document = requireDocument(collection, documentId);
  const snapshot = serializeDocument(document);
  await document.delete();
  return snapshot;
}

async function createEmbeddedDocuments(parentCollection, parentId, embeddedName, documents) {
  assertEmbeddedSupported(parentCollection, embeddedName);
  const parent = requireDocument(parentCollection, parentId);
  const created = await parent.createEmbeddedDocuments(embeddedName, documents);
  return created.map((entry) => serializeDocument(entry));
}

async function updateEmbeddedDocuments(parentCollection, parentId, embeddedName, documents) {
  assertEmbeddedSupported(parentCollection, embeddedName);
  const parent = requireDocument(parentCollection, parentId);
  const updated = await parent.updateEmbeddedDocuments(embeddedName, documents);
  return updated.map((entry) => serializeDocument(entry));
}

async function deleteEmbeddedDocuments(parentCollection, parentId, embeddedName, embeddedIds) {
  assertEmbeddedSupported(parentCollection, embeddedName);
  const parent = requireDocument(parentCollection, parentId);
  const snapshots = embeddedIds.map((id) => {
    const existing = parent.getEmbeddedDocument(embeddedName, id);
    if (!existing) {
      throw new Error(`${embeddedName} not found on ${parentCollection}: ${id}`);
    }
    return serializeDocument(existing);
  });
  await parent.deleteEmbeddedDocuments(embeddedName, embeddedIds);
  return snapshots;
}

function getDocumentClass(collection) {
  switch (collection) {
    case "Actor":
      return Actor;
    case "Item":
      return Item;
    case "JournalEntry":
      return JournalEntry;
    case "Scene":
      return Scene;
    case "RollTable":
      return RollTable;
    case "Folder":
      return Folder;
    case "Playlist":
      return Playlist;
    case "Macro":
      return Macro;
    case "Cards":
      return Cards;
    default:
      throw new Error(`No document class found for ${collection}`);
  }
}

function listCompendiumPacks({ documentName } = {}) {
  return game.packs
    .filter((pack) => !documentName || pack.documentName === documentName)
    .map((pack) => ({
      id: pack.collection,
      label: pack.metadata.label,
      documentName: pack.documentName,
      packageType: pack.metadata.packageType,
      packageName: pack.metadata.packageName
    }));
}

async function searchCompendium({ packId, query = "", type, limit = 50, offset = 0 } = {}) {
  const pack = game.packs.get(packId);
  if (!pack) {
    throw new Error(`Compendium pack not found: ${packId}`);
  }
  const index = await pack.getIndex();
  const lowered = String(query).trim().toLowerCase();
  const matches = index.contents
    .filter((entry) => {
      if (type && entry.type !== type) return false;
      if (!lowered) return true;
      return String(entry.name ?? "").toLowerCase().includes(lowered);
    });
  const pageOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  return {
    total: matches.length,
    offset: pageOffset,
    limit: pageSize,
    entries: matches
    .slice(pageOffset, pageOffset + pageSize)
    .map((entry) => ({
      id: entry._id,
      name: entry.name,
      type: entry.type ?? null,
      img: entry.img ?? null
    }))
  };
}

async function getCompendiumEntry(packId, entryId) {
  const pack = game.packs.get(packId);
  if (!pack) {
    throw new Error(`Compendium pack not found: ${packId}`);
  }
  const document = await pack.getDocument(entryId);
  if (!document) {
    throw new Error(`Compendium entry not found: ${entryId}`);
  }
  return serializeDocument(document);
}

async function importCompendiumEntry({ packId, entryId, targetCollection, folderId }) {
  const pack = game.packs.get(packId);
  if (!pack) {
    throw new Error(`Compendium pack not found: ${packId}`);
  }
  const document = await pack.getDocument(entryId);
  if (!document) {
    throw new Error(`Compendium entry not found: ${entryId}`);
  }

  const collection = targetCollection || document.documentName;
  const data = document.toObject();
  if (folderId) {
    data.folder = folderId;
  }
  const created = await getDocumentClass(collection).create(data);
  return serializeDocument(created);
}

async function placeTokens({
  sceneId,
  actorIds,
  hidden = false,
  actorLink = false,
  disposition,
  snapToGrid = true,
  collisionPolicy = "warn",
  validateOnly = false,
  placement = {}
}) {
  const scene = sceneId ? requireDocument("Scene", sceneId) : game.scenes?.current;
  if (!scene) {
    throw new Error("No active scene available");
  }

  const mode = placement.mode || "center";
  const actors = actorIds.map((actorId) => requireActor(actorId));
  const coordinates = resolveTokenCoordinates(scene, actors.length, mode, placement, snapToGrid);
  const collisionReport = assessTokenPlacement(scene, actors, coordinates);

  if (collisionPolicy === "reject" && collisionReport.collisions.length > 0) {
    throw new Error(`Token placement rejected due to ${collisionReport.collisions.length} collision(s)`);
  }

  if (validateOnly) {
    return {
      ok: collisionPolicy !== "reject" || collisionReport.collisions.length === 0,
      sceneId: scene.id,
      collisionPolicy,
      ...collisionReport
    };
  }

  const tokenData = actors.map((actor, index) => {
    const base = actor.getTokenDocument()?.toObject?.() ?? actor.prototypeToken?.toObject?.() ?? {};
    const point = coordinates[index];
    return {
      ...base,
      actorId: actor.id,
      actorLink,
      hidden,
      disposition: disposition ?? base.disposition,
      x: point.x,
      y: point.y,
      name: actor.name
    };
  });

  const created = await scene.createEmbeddedDocuments("Token", tokenData);
  return {
    sceneId: scene.id,
    collisionPolicy,
    collisions: collisionReport.collisions,
    warnings: collisionReport.warnings,
    tokens: created.map((token) => serializeDocument(token))
  };
}

function resolveTokenCoordinates(scene, count, mode, placement, snapToGrid) {
  if (mode === "coordinates") {
    const coordinates = placement.coordinates || [];
    if (coordinates.length < count) {
      throw new Error(`Not enough coordinates supplied for ${count} tokens`);
    }
    return coordinates.slice(0, count).map((point) => normalizePoint(scene, point.x, point.y, snapToGrid));
  }

  const gridSize = scene.grid?.size || 100;
  const dimensions = scene.dimensions || { width: scene.width, height: scene.height };
  const originX = placement.startX ?? Math.max(gridSize, Math.floor((dimensions.width || gridSize) / 2));
  const originY = placement.startY ?? Math.max(gridSize, Math.floor((dimensions.height || gridSize) / 2));

  if (mode === "center") {
    return Array.from({ length: count }, (_, index) =>
      normalizePoint(scene, originX + index * gridSize, originY, snapToGrid)
    );
  }

  const spacingX = placement.spacingX ?? gridSize;
  const spacingY = placement.spacingY ?? gridSize;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return normalizePoint(
      scene,
      originX + column * spacingX,
      originY + row * spacingY,
      snapToGrid
    );
  });
}

function normalizePoint(scene, x, y, snapToGrid) {
  if (!snapToGrid || !scene.grid?.getSnappedPoint) {
    return { x, y };
  }
  const snapped = scene.grid.getSnappedPoint({ x, y });
  return { x: snapped.x, y: snapped.y };
}

function assessTokenPlacement(scene, actors, coordinates) {
  const existingTokens = [...scene.tokens];
  const collisions = [];
  const warnings = [];

  actors.forEach((actor, index) => {
    const point = coordinates[index];
    const width = actor.prototypeToken?.width ?? 1;
    const height = actor.prototypeToken?.height ?? 1;
    const bounds = buildBounds(scene, point.x, point.y, width, height);

    const hits = existingTokens
      .filter((token) => rectanglesOverlap(bounds, buildBounds(scene, token.x, token.y, token.width, token.height)))
      .map((token) => ({ tokenId: token.id, tokenName: token.name }));

    if (hits.length > 0) {
      collisions.push({
        actorId: actor.id,
        actorName: actor.name,
        point,
        overlaps: hits
      });
    }

    if (!pointWithinScene(scene, point.x, point.y)) {
      warnings.push({
        actorId: actor.id,
        actorName: actor.name,
        warning: "Placement point is outside scene bounds",
        point
      });
    }
  });

  return { collisions, warnings, coordinates };
}

function buildBounds(scene, x, y, width, height) {
  const gridSize = scene.grid?.size || 100;
  return {
    left: x,
    top: y,
    right: x + width * gridSize,
    bottom: y + height * gridSize
  };
}

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function pointWithinScene(scene, x, y) {
  const width = scene.dimensions?.width ?? scene.width ?? 0;
  const height = scene.dimensions?.height ?? scene.height ?? 0;
  return x >= 0 && y >= 0 && x <= width && y <= height;
}

function validateFolderMove({ collection, documentId, folderId = null, validateOnly = false }) {
  const document = requireDocument(collection, documentId);
  const warnings = [];

  if (folderId === null) {
    return {
      ok: true,
      validateOnly,
      collection,
      documentId,
      folderId: null,
      warnings
    };
  }

  const targetFolder = requireDocument("Folder", folderId);
  if (targetFolder.type !== collection) {
    return {
      ok: false,
      validateOnly,
      error: `Folder type mismatch: ${targetFolder.type} cannot contain ${collection}`
    };
  }

  if (collection === "Folder" && documentId === folderId) {
    return {
      ok: false,
      validateOnly,
      error: "A folder cannot be moved into itself"
    };
  }

  if (collection === "Folder") {
    let current = targetFolder;
    while (current) {
      if (current.id === documentId) {
        return {
          ok: false,
          validateOnly,
          error: "A folder cannot be moved into its own descendant"
        };
      }
      current = current.folder;
    }
  }

  if (document.folder?.id === folderId) {
    warnings.push("Document is already in the target folder");
  }

  return {
    ok: true,
    validateOnly,
    collection,
    documentId,
    folderId,
    warnings
  };
}

function runPreflight({ operation, args }) {
  switch (operation) {
    case "moveDocumentToFolder":
      return validateFolderMove({ ...args, validateOnly: true });
    case "placeTokens":
      return placeTokens({ ...args, validateOnly: true });
    default:
      throw new Error(`Unsupported preflight operation: ${operation}`);
  }
}

function findActors({ query = "", type } = {}) {
  const lowered = String(query).trim().toLowerCase();
  return [...getCollection("Actor")]
    .filter((actor) => {
      if (type && actor.type !== type) return false;
      if (!lowered) return true;
      return actor.name.toLowerCase().includes(lowered);
    })
    .map((actor) => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      img: actor.img
    }));
}

function getActor(actorId) {
  return serializeActor(requireActor(actorId));
}

async function createActor(data) {
  const actorData = {
    name: data.name,
    type: data.type ?? "npc",
    folder: data.folderId ?? null,
    img: data.img,
    system: data.system ?? {},
    prototypeToken: data.prototypeToken ?? {},
    ownership: data.ownership
  };

  const actor = await createDocument("Actor", actorData);
  if (Array.isArray(data.items) && data.items.length > 0) {
    await createEmbeddedDocuments("Actor", actor.id, "Item", data.items);
  }
  return getActor(actor.id);
}

async function updateActor(actorId, updates) {
  await updateDocument("Actor", actorId, updates);
  return getActor(actorId);
}

async function replaceActorItems(actorId, items) {
  const actor = requireActor(actorId);
  const existingIds = actor.items.map((item) => item.id);
  const previousItems = actor.items.map((item) => item.toObject());
  if (existingIds.length > 0) {
    await deleteEmbeddedDocuments("Actor", actorId, "Item", existingIds);
  }
  if (Array.isArray(items) && items.length > 0) {
    await createEmbeddedDocuments("Actor", actorId, "Item", items);
  }
  return {
    actor: getActor(actorId),
    replacedItemCount: previousItems.length,
    previousItems
  };
}

async function updatePrototypeToken(actorId, updates) {
  const actor = requireActor(actorId);
  await actor.prototypeToken.update(updates ?? {});
  return serializeActor(actor);
}

async function upsertJournalTextPage({ journalId, pageId, pageName, content, format = "plain-text", append = false }) {
  const journal = requireDocument("JournalEntry", journalId);
  let page = pageId ? journal.pages.get(pageId) : null;
  if (!page && pageName) {
    page = journal.pages.find((entry) => entry.name === pageName);
  }

  const html = format === "html" ? content : wrapPlainText(content);
  if (!page) {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [
      {
        name: pageName || "Text Page",
        type: "text",
        text: { content: html, format: 1 }
      }
    ]);
    return serializeDocument(created[0]);
  }

  const existingContent = page.text?.content || "";
  const nextContent = append ? `${existingContent}${html}` : html;
  await journal.updateEmbeddedDocuments("JournalEntryPage", [
    {
      _id: page.id,
      text: { content: nextContent, format: 1 }
    }
  ]);
  return serializeDocument(journal.pages.get(page.id));
}

function wrapPlainText(content) {
  return String(content)
    .split(/\r?\n/)
    .map((line) => `<p>${foundry.utils.escapeHTML(line)}</p>`)
    .join("");
}

async function executeBatch({ operations, dryRun = false, stopOnError = true } = {}) {
  const results = [];
  for (const operation of operations) {
    try {
      const preview = previewBatchOperation(operation);
      if (dryRun) {
        results.push({ type: operation.type, ok: true, dryRun: true, preview });
        continue;
      }
      const result = await runBatchOperation(operation);
      results.push({ type: operation.type, ok: true, result });
    } catch (error) {
      results.push({
        type: operation.type,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      if (stopOnError) break;
    }
  }
  return { dryRun, results };
}

function previewBatchOperation(operation) {
  switch (operation.type) {
    case "moveDocumentToFolder":
      return validateFolderMove({ ...operation.args, validateOnly: true });
    case "placeTokens":
      return placeTokens({ ...operation.args, validateOnly: true });
    case "createDocument":
      return { collection: operation.args.collection, action: "create" };
    case "updateDocument":
    case "deleteDocument":
      requireDocument(operation.args.collection, operation.args.documentId);
      return {
        collection: operation.args.collection,
        documentId: operation.args.documentId,
        action: operation.type
      };
    case "createEmbeddedDocuments":
    case "updateEmbeddedDocuments":
    case "deleteEmbeddedDocuments":
      requireDocument(operation.args.parentCollection, operation.args.parentId);
      assertEmbeddedSupported(operation.args.parentCollection, operation.args.embeddedName);
      return {
        parentCollection: operation.args.parentCollection,
        parentId: operation.args.parentId,
        embeddedName: operation.args.embeddedName,
        action: operation.type
      };
    default:
      throw new Error(`Unsupported batch operation: ${operation.type}`);
  }
}

async function runBatchOperation(operation) {
  switch (operation.type) {
    case "moveDocumentToFolder":
      assertWriteAllowed("document", operation.args.collection);
      return moveDocumentToFolder(operation.args);
    case "placeTokens":
      assertWriteAllowed("embedded", "Scene");
      return placeTokens(operation.args);
    case "createDocument":
      assertWriteAllowed("document", operation.args.collection);
      return createDocument(operation.args.collection, operation.args.data);
    case "updateDocument":
      assertWriteAllowed("document", operation.args.collection);
      return updateDocument(operation.args.collection, operation.args.documentId, operation.args.updates);
    case "deleteDocument":
      assertWriteAllowed("document", operation.args.collection);
      return deleteDocument(operation.args.collection, operation.args.documentId);
    case "createEmbeddedDocuments":
      assertWriteAllowed("embedded", operation.args.parentCollection);
      return createEmbeddedDocuments(
        operation.args.parentCollection,
        operation.args.parentId,
        operation.args.embeddedName,
        operation.args.documents
      );
    case "updateEmbeddedDocuments":
      assertWriteAllowed("embedded", operation.args.parentCollection);
      return updateEmbeddedDocuments(
        operation.args.parentCollection,
        operation.args.parentId,
        operation.args.embeddedName,
        operation.args.documents
      );
    case "deleteEmbeddedDocuments":
      assertWriteAllowed("embedded", operation.args.parentCollection);
      return deleteEmbeddedDocuments(
        operation.args.parentCollection,
        operation.args.parentId,
        operation.args.embeddedName,
        operation.args.embeddedIds
      );
    default:
      throw new Error(`Unsupported batch operation: ${operation.type}`);
  }
}
