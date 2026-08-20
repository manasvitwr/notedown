import { useDocumentStore } from "../../store/useDocumentStore";
import { formatBytes } from "../../lib/size";

export function DataView() {
  const doc = useDocumentStore((s) => s.doc);
  const assets = doc?.assets ?? {};
  const entries = Object.values(assets);

  return (
    <div className="p-4 overflow-y-auto h-full text-xs">
      <h3 className="text-text-secondary text-[11px] uppercase tracking-wider mb-3">
        asset registry
      </h3>

      {entries.length === 0 ? (
        <div className="text-text-dim italic">no assets stored</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-text-dim border-b border-border">
                <th className="pb-2 pr-4">id</th>
                <th className="pb-2 pr-4">mime</th>
                <th className="pb-2 pr-4">size</th>
                <th className="pb-2 pr-4">dimensions</th>
                <th className="pb-2 pr-4">original</th>
                <th className="pb-2">preview</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((asset) => (
                <tr
                  key={asset.id}
                  className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="py-2 pr-4 text-text-primary font-medium">
                    {asset.id}
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">
                    {asset.mime.replace("image/", "")}
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">
                    {formatBytes(asset.sizeBytes)}
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">
                    {asset.width > 0
                      ? `${asset.width}×${asset.height}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-text-dim">
                    {asset.originalSizeBytes
                      ? formatBytes(asset.originalSizeBytes)
                      : "—"}
                  </td>
                  <td className="py-2">
                    <img
                      src={`data:${asset.mime};base64,${asset.base64}`}
                      alt={asset.alt ?? asset.id}
                      className="h-8 rounded border border-border object-cover"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <h3 className="text-text-secondary text-[11px] uppercase tracking-wider mt-6 mb-3">
            reference definitions
          </h3>
          <pre className="bg-bg-base border border-border rounded-[var(--radius-xs)] p-3 text-text-dim overflow-x-auto">
            {entries.map(
              (a) => `[${a.id}]: data:${a.mime};base64,<${formatBytes(a.sizeBytes)}>`,
            ).join("\n")}
          </pre>
        </>
      )}
    </div>
  );
}
