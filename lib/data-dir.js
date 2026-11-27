// [dsh-purge-零甲] 插件数据目录：dsh-purge-lingjia（旧名 dsh-purge 自动迁移）
//
// 为什么要迁移而不是直接换：tuning.json / probe.json / override-state.json / backups /
// update-*.json 全在这里，硬换会让老安装丢配置。所以第一次访问时把旧目录整体改名，
// 之后就只认新名；两边都在（迁移过一次后又有人建了旧的）时优先新目录。
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR_NAME = "dsh-purge-lingjia";
export const LEGACY_DATA_DIR_NAME = "dsh-purge";

/** 返回（必要时先迁移）插件数据目录的绝对路径。 */
export function purgeDataDir(home) {
  if (!home) return "";
  const next = path.join(home, DATA_DIR_NAME);
  const legacy = path.join(home, LEGACY_DATA_DIR_NAME);
  try {
    const hasNext = fs.existsSync(next);
    if (!hasNext && fs.existsSync(legacy)) fs.renameSync(legacy, next);
  } catch { /* 跨设备/权限：退回能用到的那个 */ }
  try {
    if (fs.existsSync(next)) return next;
    if (fs.existsSync(legacy)) return legacy;
  } catch { /* ignore */ }
  return next;
}
