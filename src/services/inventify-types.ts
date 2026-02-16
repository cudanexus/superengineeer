export interface InventifyRequest {
  projectTypes: string[];
  themes: string[];
  inventifyFolder: string;
}

export interface InventifyResult {
  oneOffId: string;
  placeholderProjectId: string;
}

export interface InventifyIdea {
  name: string;
  tagline: string;
  description: string;
}

export interface InventifyService {
  start(request: InventifyRequest): Promise<InventifyResult>;
  isRunning(): boolean;
  getIdeas(): InventifyIdea[] | null;
  selectIdea(index: number): Promise<InventifyResult>;
}
