/** Portuguese homonyms need different translations in records, calls and assets. */
export const contextMessages = {
  record: [
    ["Ativo", "Active", "啟用"],
    ["Ativos", "Active", "啟用"],
    ["Inativo", "Inactive", "停用"],
    ["Inativos", "Inactive", "停用"],
  ],
  asset: [["Ativo", "Asset", "資產"]],
} as const;
export type MessageContext = keyof typeof contextMessages;
