use anchor_lang::prelude::*;
pub mod constants;
pub mod errors;
pub mod utils;
pub mod state;
pub mod instructions;
use instructions::*;
declare_id!("96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ");
#[program]
pub mod key_registry {
    use super::*;

    pub fn register_username(
        ctx: Context<RegisterUsername>,
        username: String,
        encryption_key: [u8; 32],
    ) -> Result<()> {
        instructions::username::register_username(ctx, username, encryption_key)
    }

    pub fn lookup_username(ctx: Context<LookupUsername>) -> Result<()> {
        instructions::username::lookup_username(ctx)
    }

    pub fn update_encryption_key(
        ctx: Context<UpdateEncryptionKey>,
        new_key: [u8; 32],
    ) -> Result<()> {
        instructions::encryption::update_encryption_key(ctx, new_key)
    }

    //we will be adding variouosh groups later too 
}
