好的！我来给你一套从零开始的 React Native 新手完整指引。先看整体学习路径，然后给出一个完整可运行的 App 示例。点击路径中任意步骤可深入了解。下面是具体操作细节，以及一个完整可运行的 Todo App。

---

## 第一步：环境搭建（新手强烈推荐用 Expo）

React Native 有两种开发方式，新手选 Expo：

| | Expo（推荐新手） | React Native CLI |
|---|---|---|
| 上手难度 | 低，5分钟跑起来 | 高，需装 Xcode/Android Studio |
| 真机调试 | 扫码即用 Expo Go App | 需连数据线 |
| 局限性 | 访问部分原生能力受限 | 完全自由 |

```bash
# 安装 Node.js（去 nodejs.org 下载 LTS 版）
# 然后安装 Expo CLI
npm install -g expo-cli

# 创建项目
npx create-expo-app MyTodoApp
cd MyTodoApp

# 启动开发服务器
npx expo start
```

手机上安装 **Expo Go**（App Store / 应用商店都有），扫描终端中的二维码，即可实时预览。

---

## 第二步：理解核心差异（你最需要适应的部分）

作为 PC 端前端，这几点需要转变思维：

**没有 HTML 标签**，改用 RN 内置组件：

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<p>` / `<span>` | `<Text>` |
| `<img>` | `<Image>` |
| `<input>` | `<TextInput>` |
| `<button>` | `<TouchableOpacity>` 或 `<Pressable>` |
| `<ul>/<li>` | `<FlatList>` |
| `<a>` | `<Pressable>` + Navigation |

**没有 CSS 文件**，改用 `StyleSheet.create()`，语法几乎一样，但属性名用驼峰，且只支持 Flexbox 布局（`display: flex` 是默认值，不需要写）。

---

## 第三步：完整 Todo App 代码

这是一个功能完整的 App，涵盖了 RN 开发的核心知识点。将下面的代码替换到 `App.js` 中即可运行：

```jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';

// ── 单条 Todo 组件 ──────────────────────────────────
function TodoItem({ item, onToggle, onDelete }) {
  return (
    <View style={styles.todoItem}>
      {/* 勾选按钮 */}
      <TouchableOpacity
        style={[styles.checkbox, item.done && styles.checkboxDone]}
        onPress={() => onToggle(item.id)}
      >
        {item.done && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      {/* 文本 */}
      <Text
        style={[styles.todoText, item.done && styles.todoTextDone]}
        numberOfLines={2}
      >
        {item.text}
      </Text>

      {/* 删除按钮 */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(item.id)}
      >
        <Text style={styles.deleteBtnText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 主界面 ──────────────────────────────────────────
export default function App() {
  const [todos, setTodos] = useState([
    { id: '1', text: '学习 React Native 基础组件', done: true },
    { id: '2', text: '完成第一个移动端 App', done: false },
    { id: '3', text: '了解 Flexbox 布局', done: false },
  ]);
  const [inputText, setInputText] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | done

  // 添加
  const addTodo = () => {
    if (!inputText.trim()) {
      Alert.alert('提示', '请输入任务内容');
      return;
    }
    setTodos([
      ...todos,
      { id: Date.now().toString(), text: inputText.trim(), done: false },
    ]);
    setInputText('');
  };

  // 切换完成状态
  const toggleTodo = (id) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  // 删除
  const deleteTodo = (id) => {
    Alert.alert('确认删除', '确定要删除这条任务吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        setTodos(todos.filter(t => t.id !== id));
      }},
    ]);
  };

  // 过滤
  const filteredTodos = todos.filter(t => {
    if (filter === 'active') return !t.done;
    if (filter === 'done') return t.done;
    return true;
  });

  const doneCount = todos.filter(t => t.done).length;

  return (
    // SafeAreaView：自动适配刘海屏、底部安全区域
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.title}>我的任务</Text>
        <Text style={styles.subtitle}>
          已完成 {doneCount} / {todos.length}
        </Text>
      </View>

      {/* 过滤 Tab */}
      <View style={styles.filterBar}>
        {['all', 'active', 'done'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[
              styles.filterBtnText,
              filter === f && styles.filterBtnTextActive,
            ]}>
              {{ all: '全部', active: '未完成', done: '已完成' }[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 任务列表 —— FlatList 是 RN 中处理长列表的标准组件 */}
      <FlatList
        data={filteredTodos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TodoItem item={item} onToggle={toggleTodo} onDelete={deleteTodo} />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>暂无任务</Text>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* 输入区 —— KeyboardAvoidingView 防止键盘遮挡输入框 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="添加新任务..."
            placeholderTextColor="#aaa"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={addTodo}   // 键盘回车即提交
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addTodo}>
            <Text style={styles.addBtnText}>添加</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── 样式 ────────────────────────────────────────────
// RN 的样式：语法与 CSS 几乎一样，但用 JS 对象，属性驼峰命名
// 所有布局默认是 Flexbox，主轴默认是 column（与 Web 不同！）
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,  // 1px 的平台适配写法
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  filterBar: {
    flexDirection: 'row',       // 横向排列（Flexbox）
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  filterBtnActive: {
    backgroundColor: '#4f46e5',
  },
  filterBtnText: {
    fontSize: 13,
    color: '#666',
  },
  filterBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#bbb',
    marginTop: 60,
    fontSize: 15,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    // RN 中阴影需要分平台写
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  todoText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  todoTextDone: {
    textDecorationLine: 'line-through',
    color: '#aaa',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 18,
    color: '#e05',
    lineHeight: 20,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  addBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
```

---

## 第四步：关键知识点解析

这个 App 涵盖了你需要掌握的核心内容：

**`SafeAreaView`** — 自动处理刘海屏和底部小黑条，替代 Web 的 `env(safe-area-inset-*)` 手动处理。

**`FlatList`** — 虚拟列表，不会把所有 DOM 渲染到屏幕外，性能比 `ScrollView + map` 强得多，长列表必用。

**`KeyboardAvoidingView`** — 软键盘弹起时，防止遮挡输入框。`Platform.OS === 'ios'` 用来区分平台写法差异，这在 RN 里很常见。

**`StyleSheet.hairlineWidth`** — 相当于移动端的「1px 问题」解决方案，自动适配当前设备 DPR。

**`Platform.select()`** — iOS 和 Android 的阴影属性完全不同（iOS 用 `shadow*`，Android 用 `elevation`），这是标准的跨平台写法。

**`Alert.alert()`** — 调用原生系统弹窗，比 Web 的 `window.confirm` 体验好得多。

---
