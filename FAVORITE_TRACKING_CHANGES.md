# 实时收藏状态跟踪实现说明

## 问题描述
在右键菜单和选择操作栏中，收藏按钮的状态在用户点击切换后不会实时更新，导致用户体验不佳。

## 根本原因分析

### 1. 异步更新延迟
在 `useLibraryStore.ts` 中的 `toggleFavorite` 方法：
- 调用后端 API 获得新状态
- 更新 `favoriteSet` 依赖 `refreshFavorites()` 的异步完成
- 但 `refreshFavorites()` 没有被等待，导致 UI 更新延迟

### 2. 依赖关系不完整
在 `useSongOperations.ts` 中的 `singleIsFavorite` 和 `isAllFavorited`：
- 虽然已经监听 `libraryVersion`
- 但 `isFavorite` 函数本身每次都是新创建的，导致依赖关系不稳定

## 解决方案

### 1. 优化 toggleFavorite（useLibraryStore.ts）

**变更内容：**
- 立即更新 `favoriteSet` 而不是等待异步的 `refreshFavorites()`
- `refreshFavorites()` 作为后备验证（非阻塞）

**代码改动：**
```typescript
toggleFavorite: async (song) => {
    if (!song.id) return;
    try {
        const newStatus = await libraryService.toggleFavorite(song.id);

        // 立即更新 favoriteSet 用于反应式 UI
        set((state) => {
            const newFavoriteSet = new Set(state.favoriteSet);
            if (newStatus) {
                newFavoriteSet.add(song.id);
            } else {
                newFavoriteSet.delete(song.id);
            }
            return { favoriteSet: newFavoriteSet };
        });

        // 触发库版本更新以刷新其他组件
        get().triggerLibraryUpdate();

        // ... 更新本地播放列表状态 ...

        // 后备验证（非阻塞）
        get().refreshFavorites();

    } catch (error) {
        console.error('Failed to toggle favorite', error);
    }
},
```

**关键改进：**
- 同步更新 `favoriteSet` → 立即触发依赖该 Set 的组件重新计算
- 同步更新 `libraryVersion` → 刷新依赖该版本的其他计算
- 异步的 `refreshFavorites()` 作为备份验证

### 2. 增强依赖关系（useSongOperations.ts）

**变更内容：**
- 从 store 提取 `favoriteSet` 并添加到依赖列表
- 确保当 `favoriteSet` 变化时，`singleIsFavorite` 和 `isAllFavorited` 重新计算

**代码改动：**
```typescript
// 提取 favoriteSet
const { ..., favoriteSet } = useLibraryStore();

// 更新 singleIsFavorite 依赖
const singleIsFavorite = useMemo(() => {
    if (!isSingle || !firstItem) return false;
    return isFavorite(firstItem as any);
}, [isSingle, firstItem, isFavorite, libraryVersion, favoriteSet]); // 添加 favoriteSet

// 更新 isAllFavorited 依赖
const isAllFavorited = useMemo(() => {
    if (!items.length) return false;
    if (isSingle) return singleIsFavorite;
    return items.every(i => isFavorite(i as any));
}, [items, isSingle, singleIsFavorite, isFavorite, libraryVersion, favoriteSet]); // 添加 favoriteSet
```

**关键改进：**
- `favoriteSet` 是 Zustand store 中的最小化状态
- 监听该 Set 比监听整个 `isFavorite` 函数更可靠
- 避免了函数引用导致的依赖不稳定

## 实现流程

### 右键菜单收藏状态实时更新
1. 用户右键点击歌曲 → 打开 `SmartCursorContextMenu`
2. 菜单使用 `useSongOperations` 生成菜单项
3. `useSongOperations` 中的 `isAllFavorited` 依赖 `favoriteSet`
4. 用户点击"喜爱"→ 调用 `handleFavorite()`
5. `handleFavorite()` 调用 `toggleFavorite()` → 立即更新 `favoriteSet`
6. `favoriteSet` 变化 → `useMemo` 依赖触发 → `isAllFavorited` 重新计算
7. 菜单项图标和标签更新：`MdFavoriteBorder` ↔ `MdFavorite`，"喜爱" ↔ "取消喜爱"

### 选择操作栏收藏状态实时更新
1. 用户选择多首歌曲 → `SelectionActionBar` 显示
2. 操作栏使用 `useSongOperations` 生成操作按钮
3. 用户点击收藏按钮 → 批量收藏所有选中歌曲
4. 每首歌曲的 `toggleFavorite()` 被调用 → `favoriteSet` 更新
5. `isAllFavorited` 重新计算 → 收藏图标状态更新

## 测试验证步骤

### 测试 1：单首歌曲右键菜单
1. 在库中选择未收藏的歌曲，右键点击
2. 菜单应显示"喜爱"（心形空心）
3. 点击"喜爱"
4. 菜单应立即更新为"取消喜爱"（心形实心）

### 测试 2：多首歌曲选择栏
1. 选择 3 首未收藏的歌曲
2. 操作栏应显示"喜爱"图标
3. 点击"喜爱"按钮
4. 所有 3 首歌曲应被标记为收藏
5. 图标应立即更新为"取消喜爱"

### 测试 3：混合状态
1. 选择 2 首已收藏 + 1 首未收藏的歌曲
2. 点击"喜爱"按钮 → 应全部标记为收藏
3. 图标应更新为"取消喜爱"
4. 再次点击 → 应全部取消收藏
5. 图标应更新为"喜爱"

## 性能考虑

- `favoriteSet` 是 `Set<number>`，非常高效
- 依赖变化频率低（只在收藏/取消收藏时）
- 组件的 `useMemo` 重新计算成本最小（简单布尔判断）

## 向后兼容性

所有更改都是内部实现优化，不改变：
- 公共 API 接口
- 存储结构
- 后端交互方式
- 组件 Props 类型

## 相关文件

- [useLibraryStore.ts](src/store/useLibraryStore.ts#L339-L375)：`toggleFavorite` 实现
- [useSongOperations.ts](src/hooks/useSongOperations.ts#L57-L87)：`singleIsFavorite` 和 `isAllFavorited` 依赖
- [SmartCursorContextMenu.tsx](src/components/common/SmartCursorContextMenu.tsx)：右键菜单渲染
- [SelectionActionBar.tsx](src/features/selection/SelectionActionBar.tsx)：选择操作栏渲染
