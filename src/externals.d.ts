// Stub declarations for optional peer dependencies.
// These are dynamically imported at runtime; only installed SDKs will work.

declare module "grammy" { export const Bot: any; }
declare module "discord.js" { export const Client: any; export const GatewayIntentBits: any; export const Events: any; }
declare module "@slack/bolt" { export const App: any; }
declare module "whatsapp-web.js" { export const Client: any; export const LocalAuth: any; }
declare module "matrix-bot-sdk" { export const MatrixClient: any; export const SimpleFsStorageProvider: any; export const AutojoinRoomsMixin: any; }
declare module "botbuilder" { export const BotFrameworkAdapter: any; }
declare module "express" { const e: any; export default e; }
declare module "@line/bot-sdk" { export const messagingApi: any; export const middleware: any; }
declare module "@larksuiteoapi/node-sdk" { export const Client: any; }
declare module "ws" { const WS: any; export default WS; }
declare module "nostr-tools" { export const getPublicKey: any; export const finalizeEvent: any; }
declare module "tmi.js" { export const Client: any; }
declare module "irc-framework" { export const Client: any; }
