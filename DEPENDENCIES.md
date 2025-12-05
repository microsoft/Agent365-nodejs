# Microsoft Agent 365 SDK Node.js Package Dependencies

This diagram shows the internal dependencies between Microsoft Agent 365 SDK Node.js packages.

```mermaid
graph LR
  agents_a365_notifications[agents-a365-notifications]
  agents_a365_observability[agents-a365-observability]
  agents_a365_observability_extensions_openai[agents-a365-observability-extensions-openai]
  agents_a365_observability_tokencache[agents-a365-observability-tokencache]
  agents_a365_runtime[agents-a365-runtime]
  agents_a365_tooling[agents-a365-tooling]
  agents_a365_tooling_extensions_claude[agents-a365-tooling-extensions-claude]
  agents_a365_tooling_extensions_langchain[agents-a365-tooling-extensions-langchain]
  agents_a365_tooling_extensions_openai[agents-a365-tooling-extensions-openai]

  agents_a365_notifications --> agents_a365_runtime
  agents_a365_observability --> agents_a365_runtime
  agents_a365_observability_extensions_openai --> agents_a365_observability
  agents_a365_observability_tokencache --> agents_a365_observability
  agents_a365_observability_tokencache --> agents_a365_runtime
  agents_a365_tooling --> agents_a365_runtime
  agents_a365_tooling_extensions_claude --> agents_a365_runtime
  agents_a365_tooling_extensions_claude --> agents_a365_tooling
  agents_a365_tooling_extensions_langchain --> agents_a365_runtime
  agents_a365_tooling_extensions_langchain --> agents_a365_tooling
  agents_a365_tooling_extensions_openai --> agents_a365_runtime
  agents_a365_tooling_extensions_openai --> agents_a365_tooling

  style agents_a365_notifications fill:#ffcdd2,stroke:#c62828,color:#280505
  style agents_a365_observability fill:#c8e6c9,stroke:#2e7d32,color:#142a14
  style agents_a365_observability_extensions_openai fill:#e8f5e9,stroke:#66bb6a,color:#1f3d1f
  style agents_a365_observability_tokencache fill:#e8f5e9,stroke:#66bb6a,color:#1f3d1f
  style agents_a365_runtime fill:#bbdefb,stroke:#1565c0,color:#0d1a26
  style agents_a365_tooling fill:#ffe0b2,stroke:#e65100,color:#331a00
  style agents_a365_tooling_extensions_claude fill:#fff3e0,stroke:#fb8c00,color:#4d2600
  style agents_a365_tooling_extensions_langchain fill:#fff3e0,stroke:#fb8c00,color:#4d2600
  style agents_a365_tooling_extensions_openai fill:#fff3e0,stroke:#fb8c00,color:#4d2600
```
## Package Types

- **Notifications** (Red): Notification and messaging extensions
- **Observability** (Green): Telemetry and monitoring core
- **Observability Extensions** (Light Green): Framework-specific observability integrations
- **Runtime** (Blue): Core runtime components
- **Tooling** (Orange): Agent tooling SDK core
- **Tooling Extensions** (Light Orange): Framework-specific tooling integrations

