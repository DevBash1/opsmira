import { ContainersScene, CpuScene, DiskScene, FilesScene, InventoryScene, LogsScene, MemoryScene, NetworkScene, ProcessesScene } from "./DiagnosticScenes";
import { ComposedScene } from "./ComposedScene";
import { CleanupScene, FirewallScene, JobsScene, TlsScene, UnavailableScene, UptimeScene } from "./LiveScenes";

/** What the Surfaces menu knows about a surface. The list itself comes from the server (GET /api/surfaces). */
export interface SurfaceInfo {
  id: string;
  name: string;
  group: string;
  description: string;
}

type SceneViewProps = {
  scene: string;
  data?: Record<string, unknown>;
  onAsk?: (prompt: string) => void;
};

/** Renders a surface. Its blocks arrive one after another (`.scene-stagger`, see index.css). */
export function SceneView(props: SceneViewProps) {
  const content = renderScene(props);
  return content ? <div className="scene-stagger group/scene w-full">{content}</div> : null;
}

function renderScene({ scene, data, onAsk }: SceneViewProps) {
  switch (scene) {
    case "memory":
      return <MemoryScene data={data} />;
    case "cpu":
      return <CpuScene data={data} onAsk={onAsk} />;
    case "network":
      return <NetworkScene data={data} onAsk={onAsk} />;
    case "disk":
      return <DiskScene data={data} onAsk={onAsk} />;
    case "processes":
      return <ProcessesScene data={data} onAsk={onAsk} />;
    case "logs":
      return <LogsScene data={data} onAsk={onAsk} />;
    case "files":
      return <FilesScene data={data} onAsk={onAsk} />;
    case "containers":
      return <ContainersScene data={data} onAsk={onAsk} />;
    case "inventory":
      return <InventoryScene data={data} onAsk={onAsk} />;
    case "uptime":
      return <UptimeScene data={data} onAsk={onAsk} />;
    case "jobs":
      return <JobsScene data={data} onAsk={onAsk} />;
    case "tls":
      return <TlsScene data={data} onAsk={onAsk} />;
    case "firewall":
      return <FirewallScene data={data} onAsk={onAsk} />;
    case "cleanup":
      return <CleanupScene data={data} onAsk={onAsk} />;
    case "view":
      return <ComposedScene data={data} onAsk={onAsk} />;
    case "unavailable":
      return <UnavailableScene data={data} onAsk={onAsk} />;
    default:
      return null;
  }
}
