import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  StatsData,
  AddEntryPayload,
  UpdateEntryPatch,
  GatewayAdapter,
} from "./types";
import * as mock from "./mock";

export class MockAdapter implements GatewayAdapter {
  async getEntries(): Promise<Entry[]> {
    return mock.mockGetEntries();
  }

  async getMaster(): Promise<MasterRow> {
    return mock.mockGetMaster();
  }

  async getCategories(): Promise<CategoryMap> {
    return mock.mockGetCategories();
  }

  async getConfig(): Promise<Config> {
    return mock.mockGetConfig();
  }

  async getStats(): Promise<StatsData> {
    return mock.mockGetStats();
  }

  async addEntry(payload: AddEntryPayload): Promise<Entry> {
    return mock.mockAddEntry(payload);
  }

  async addEntries(payloads: AddEntryPayload[]): Promise<Entry[]> {
    return mock.mockAddEntries(payloads);
  }

  async updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
    return mock.mockUpdateEntry(id, patch);
  }

  async deleteEntry(id: number): Promise<void> {
    return mock.mockDeleteEntry(id);
  }

  async validateConnection(_gasUrl: string, _apiSecret: string): Promise<void> {
    return Promise.resolve();
  }
}
