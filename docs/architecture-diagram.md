# Superengineer Architecture Diagram

**Note**: When creating Mermaid diagrams, avoid these common syntax errors:
- Don't use curly braces `{}` in node labels (they define rhombus shapes)
- Don't use quotes in subgraph names
- Replace special characters like `<>` and backslashes
- Use simple alphanumeric IDs for subgraphs

## System Overview

```mermaid
graph TB
    subgraph "Frontend (Browser)"
        UI[Web UI<br/>jQuery + Tailwind CSS]
        WC[WebSocket Client]
    end

    subgraph "Backend (Node.js/Express)"
        HTTP[Express HTTP Server<br/>:3000]
        WS[WebSocket Server]

        subgraph "API Routes"
            PR[Projects Routes]
            SR[Settings Routes]
            FSR[Filesystem Routes]
            AR[Agents Routes]
            GR[Git Routes]
            RLR[Ralph Loop Routes]
        end

        subgraph "Core Services"
            PM[ProjectService]
            AM[AgentManager]
            RP[RoadmapParser]
            RG[RoadmapGenerator]
            IG[InstructionGenerator]
            GS[GitService]
            RLS[RalphLoopService]
            EM[EventManager]
        end

        subgraph "Repositories"
            PRepo[ProjectRepository]
            CRepo[ConversationRepository]
            SRepo[SettingsRepository]
        end

        subgraph "Agent Management"
            CA[ClaudeAgent<br/>Claude Code CLI Process]
            AQ[Agent Queue]
            PC[Process Controller]
        end
    end

    subgraph "File System"
        GD[Global Data<br/>~/.superengineer-v5/]
        PD[Project Data<br/>{project}/.superengineer-v5/]
        PF[Project Files]
    end

    subgraph "External"
        CC[Claude Code CLI]
        Git[Git Repository]
    end

    %% Frontend connections
    UI --> HTTP
    UI <--> WC
    WC <--> WS

    %% HTTP Server connections
    HTTP --> PR
    HTTP --> SR
    HTTP --> FSR
    HTTP --> AR
    HTTP --> GR
    HTTP --> RLR

    %% Route to Service connections
    PR --> PM
    PR --> AM
    PR --> RP
    PR --> RG
    PR --> IG
    PR --> GS
    PR --> RLS
    AR --> AM
    GR --> GS
    RLR --> RLS

    %% Service to Repository connections
    PM --> PRepo
    AM --> CRepo
    SR --> SRepo
    RLS --> PRepo

    %% AgentManager connections
    AM --> CA
    AM --> AQ
    AM --> PC
    AM --> EM

    %% WebSocket connections
    WS --> AM
    WS --> EM

    %% File system connections
    PRepo --> GD
    PRepo --> PD
    CRepo --> PD
    SRepo --> GD
    CA --> PF
    GS --> PF

    %% External connections
    CA --> CC
    GS --> Git

    %% Event flow
    EM -.->|Events| WS
    CA -.->|Output| AM
    AM -.->|Status| WS
```

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph "User Actions"
        UA1[Create Project]
        UA2[Start Agent]
        UA3[Send Message]
        UA4[Select Milestone]
    end

    subgraph "API Layer"
        API[REST API]
        WSS[WebSocket]
    end

    subgraph "Business Logic"
        BL1[Project Management]
        BL2[Agent Control]
        BL3[Conversation Handling]
        BL4[Roadmap Processing]
    end

    subgraph "Data Storage"
        DS1[Projects Index]
        DS2[Project Status]
        DS3[Conversations]
        DS4[Settings]
    end

    subgraph "External Processes"
        EP1[Claude Code CLI]
        EP2[Git Operations]
    end

    %% User to API
    UA1 --> API
    UA2 --> API
    UA3 --> API
    UA4 --> API

    %% API to Business Logic
    API --> BL1
    API --> BL2
    API --> BL3
    API --> BL4

    %% Real-time updates
    UA3 -.-> WSS
    WSS <-.-> BL2

    %% Business Logic to Storage
    BL1 --> DS1
    BL1 --> DS2
    BL2 --> DS2
    BL3 --> DS3
    BL4 --> DS2

    %% Business Logic to External
    BL2 --> EP1
    BL1 --> EP2

    %% External to Business Logic
    EP1 --> BL2
    EP1 --> BL3
```

## Agent Lifecycle Diagram

```mermaid
stateDiagram-v2
    [*] --> Stopped

    Stopped --> Queued: Start Agent
    Queued --> Starting: Queue Processing
    Starting --> Running: Process Started

    Running --> Interactive: Interactive Mode
    Running --> Autonomous: Loop Mode
    Running --> RalphLoop: Ralph Loop Mode

    Interactive --> WaitingForInput: Awaiting User
    WaitingForInput --> Processing: Message Received
    Processing --> Interactive: Response Sent

    Autonomous --> ExecutingTask: Next Milestone
    ExecutingTask --> Autonomous: Task Complete

    RalphLoop --> WorkerRunning: Worker Phase
    WorkerRunning --> ReviewerRunning: Worker Complete
    ReviewerRunning --> RalphLoop: Review Complete
    ReviewerRunning --> Completed: Approved

    Interactive --> Stopping: Stop Command
    Autonomous --> Stopping: Stop/Complete
    RalphLoop --> Stopping: Stop/Complete

    Stopping --> Stopped: Cleanup Done

    Running --> Failed: Error
    Failed --> Stopped: Cleanup
```

## Component Interaction Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Web UI
    participant API as API Server
    participant AM as AgentManager
    participant CA as ClaudeAgent
    participant WS as WebSocket
    participant FS as File System

    U->>UI: Start Interactive Agent
    UI->>API: POST /projects/:id/agent/interactive
    API->>AM: startInteractiveAgent()
    AM->>CA: spawn claude-code process
    CA-->>AM: Process started
    AM->>FS: Create conversation
    AM-->>API: Success response
    API-->>UI: Agent started

    AM-->>WS: agent_status: running
    WS-->>UI: Status update

    U->>UI: Send message
    UI->>API: POST /projects/:id/agent/send
    API->>AM: sendInput()
    AM->>CA: Write to stdin

    CA-->>AM: Tool use output
    AM-->>WS: agent_message
    WS-->>UI: Display output

    CA-->>AM: Response complete
    AM-->>WS: agent_waiting
    WS-->>UI: Enable input
```

## Data Storage Structure

```mermaid
graph TD
    subgraph "~/.superengineer-v5/ (Global)"
        GS[settings.json]
        PI[projects/index.json]
        PID[pids.json]
    end

    subgraph "{project}/.superengineer-v5/ (Per Project)"
        PS[status.json]
        subgraph "conversations/"
            C1["{uuid}.json"]
            C2["{uuid}.json"]
            C3["..."]
        end
    end

    subgraph "Project Files"
        CLAUDE[CLAUDE.md]
        subgraph "doc/"
            ROADMAP[ROADMAP.md]
        end
    end

    PI --> PS
    PS --> C1
    PS --> C2
    PS --> C3
```

## Key Features Flow

```mermaid
flowchart TB
    subgraph "Ralph Loop Feature"
        RLStart[Start Ralph Loop] --> RLWorker[Worker Agent Executes]
        RLWorker --> RLReview[Reviewer Agent Evaluates]
        RLReview --> RLDecision{Review Decision}
        RLDecision -->|Reject| RLWorker
        RLDecision -->|Approve| RLComplete[Task Complete]
        RLDecision -->|Fail| RLFailed[Task Failed]
    end

    subgraph "Permission System"
        PM1[Global Permissions] --> PM2[Project Overrides]
        PM2 --> PM3[Runtime Mode]
        PM3 --> PM4{Permission Check}
        PM4 -->|Allow| PMAllow[Execute Tool]
        PM4 -->|Deny| PMDeny[Block Execution]
    end

    subgraph "Session Management"
        SM1[New Conversation] --> SM2[Generate UUID]
        SM2 --> SM3[Start Claude Session]
        SM3 --> SM4[Track in status.json]
        SM4 --> SM5[WebSocket Updates]
    end
```

This architecture diagram shows:

1. **System Overview**: The main components and their relationships
2. **Data Flow**: How user actions flow through the system
3. **Agent Lifecycle**: The various states an agent can be in
4. **Component Interaction**: A typical sequence of interactions
5. **Data Storage Structure**: How data is organized on disk
6. **Key Features Flow**: Important feature implementations like Ralph Loop and permissions

The project follows a clean architecture with:
- Clear separation between frontend and backend
- Repository pattern for data access
- Service layer for business logic
- Event-driven architecture for real-time updates
- Process management for external Claude Code CLI integration