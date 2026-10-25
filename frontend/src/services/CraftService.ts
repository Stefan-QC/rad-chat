import { expectOk, unwrap, type Db } from '../core/supabase';
import type { CraftWorld } from '../core/types';

export class CraftService {
  constructor(private readonly db: Db) {}

  async loadWorld(): Promise<CraftWorld> {
    return unwrap(await this.db.rpc('craft_get_world'));
  }

  async setBlock(x: number, y: number, z: number, id: number): Promise<void> {
    expectOk(await this.db.rpc('craft_set_block', { p_x: x, p_y: y, p_z: z, p_id: id }));
  }
}
