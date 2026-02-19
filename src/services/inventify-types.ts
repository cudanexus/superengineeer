export interface InventifyRequest {
  projectTypes: string[];
  themes: string[];
  languages: string[];
  technologies: string[];
  customPrompt: string;
  inventifyFolder: string;
}

export interface InventifyResult {
  oneOffId?: string;
  placeholderProjectId: string;
  newProjectId?: string;
  prompt?: string;
}

export interface InventifyIdea {
  name: string;
  tagline: string;
  description: string;
}

export interface InventifyNameSuggestion {
  names: string[];
  ideaIndex: number;
}

export interface InventifyBuildResult {
  newProjectId: string;
  projectName: string;
}

export interface InventifyService {
  start(request: InventifyRequest): Promise<InventifyResult>;
  isRunning(): boolean;
  getIdeas(): InventifyIdea[] | null;
  suggestNames(index: number): Promise<InventifyResult>;
  getNameSuggestions(): InventifyNameSuggestion | null;
  selectIdea(index: number, projectName: string): Promise<InventifyResult>;
  completeBuild(projectId: string, projectPath: string): Promise<void>;
  getBuildResult(): InventifyBuildResult | null;
  cancel(): Promise<void>;
}
