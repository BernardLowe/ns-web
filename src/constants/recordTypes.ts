// Record Type Constants for DWebNS Resolver
// See RECORD_TYPES.md for complete documentation

export const RecordTypes = {
  // DNS Standard Types
  TYPE_A: 1,
  TYPE_TXT: 16,
  
  // Address Records (0xFF00-0xFF3F)
  TYPE_ETH_ADDRESS: 65280,   // 0xFF00
  TYPE_BTC_ADDRESS: 65281,   // 0xFF01
  TYPE_SOL_ADDRESS: 65282,   // 0xFF02
  
  // Identity/Crypto Records (0xFF40-0xFF7F)
  TYPE_PUBKEY: 65344,        // 0xFF40
  TYPE_DID: 65345,           // 0xFF42
  
  // Content Records (0xFF80-0xFFBF)
  TYPE_CONTENT_HASH: 65408,  // 0xFF80
  TYPE_IPFS_CID: 65409,      // 0xFF81
  TYPE_SWARM_HASH: 65410,    // 0xFF82
  TYPE_ARWEAVE_ID: 65411,    // 0xFF83
} as const;

export type RecordType = typeof RecordTypes[keyof typeof RecordTypes];
