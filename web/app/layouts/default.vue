<script setup lang="ts">
import { Collection, Document, Grid, House, Search, Setting, User } from '@element-plus/icons-vue'

const route = useRoute()

const routeMeta: Record<string, { group: string, label: string }> = {
  '/': { group: '工作台', label: '今日工作台' },
  '/applications': { group: '推进求职', label: '投递看板' },
  '/jobs': { group: '推进求职', label: '岗位库' },
  '/materials': { group: '准备资料', label: '素材库' },
  '/resumes': { group: '准备资料', label: '简历版本' },
  '/application-profile': { group: '准备资料', label: '网申档案' },
  '/personal-profile': { group: '准备资料', label: '个人档案' },
  '/ai-settings': { group: '系统', label: 'API 设置' },
  '/interview-prep': { group: '面试准备', label: '面试准备' },
}

const currentMeta = computed(() => routeMeta[route.path] ?? { group: '求职工作台', label: '工作区' })
</script>

<template>
  <el-container class="workbench-shell">
    <el-aside width="248px" class="workbench-sidebar p-5">
      <NuxtLink to="/applications" class="mb-8 flex items-center gap-3 px-2 pt-2 no-underline">
        <span class="grid h-10 w-10 place-items-center rounded-[14px] bg-[linear-gradient(145deg,#a6bce6,#7898d0)] text-lg text-white shadow-[0_8px_18px_rgba(93,125,182,.25)]">求</span>
        <span>
          <strong class="block text-[15px] tracking-wide text-[#3b4657]">求职小助手</strong>
          <small class="font-mono text-[11px] tracking-wide text-[#8c98ab]">PERSONAL CAREER OS</small>
        </span>
      </NuxtLink>

      <nav aria-label="工作台导航" class="workbench-navigation">
        <p class="mb-2 px-2 font-mono text-[11px] tracking-[0.14em] text-[#8290a1]">推进求职</p>
        <el-menu :default-active="$route.path" router class="mb-6 border-0 !bg-transparent">
          <el-menu-item index="/"><el-icon><House /></el-icon><span>今日工作台</span></el-menu-item>
          <el-menu-item index="/applications"><el-icon><Grid /></el-icon><span>投递看板</span></el-menu-item>
        </el-menu>
        <el-menu :default-active="$route.path" router class="mb-6 border-0 !bg-transparent">
          <el-menu-item index="/jobs"><el-icon><Search /></el-icon><span>岗位库</span></el-menu-item>
        </el-menu>

        <p class="mb-2 px-2 font-mono text-[11px] tracking-[0.14em] text-[#8290a1]">准备资料</p>
        <el-menu :default-active="$route.path" router class="mb-6 border-0 !bg-transparent">
          <el-menu-item index="/materials"><el-icon><Collection /></el-icon><span>素材库</span></el-menu-item>
          <el-menu-item index="/resumes"><el-icon><Document /></el-icon><span>简历版本</span></el-menu-item>
          <el-menu-item index="/application-profile"><el-icon><Grid /></el-icon><span>网申档案</span></el-menu-item>
          <el-menu-item index="/personal-profile"><el-icon><User /></el-icon><span>个人档案</span></el-menu-item>
        </el-menu>

        <p class="mb-2 px-2 font-mono text-[11px] tracking-[0.14em] text-[#8290a1]">面试准备</p>
        <el-menu :default-active="$route.path" router class="mb-6 border-0 !bg-transparent">
          <el-menu-item index="/interview-prep"><el-icon><Document /></el-icon><span>面试准备</span></el-menu-item>
        </el-menu>

        <p class="mb-2 px-2 font-mono text-[11px] tracking-[0.14em] text-[#8290a1]">系统</p>
        <el-menu :default-active="$route.path" router class="border-0 !bg-transparent">
          <el-menu-item index="/ai-settings"><el-icon><Setting /></el-icon><span>API 设置</span></el-menu-item>
        </el-menu>
      </nav>
    </el-aside>
    <el-container>
      <el-header class="workbench-topbar flex h-14 items-center justify-between px-5 md:px-7">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-[#7b899a]">{{ currentMeta.group }}</span><span class="text-[#a2adba]">/</span><strong class="font-medium text-[#31445b]">{{ currentMeta.label }}</strong>
        </div>
        <span class="workbench-mode"><i />本地单用户模式</span>
      </el-header>
      <el-main class="workbench-main">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
:deep(.el-menu) {
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: rgba(255, 255, 255, 0.34);
  --el-menu-active-color: #586c8e;
  --el-menu-text-color: #68716e;
}

:deep(.el-menu-item) {
  height: 42px;
  margin: 2px 0;
  border-radius: 10px;
  font-size: 14px;
}

:deep(.el-menu-item .el-icon),
.workbench-planned-item .el-icon {
  color: #7e91a1;
  font-size: 16px;
}

.workbench-planned-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
}

.workbench-planned-item small {
  margin-left: auto;
  color: #91a69d;
  font-size: 11px;
}

.workbench-menu-soon {
  margin-left: auto;
  color: #91a69d;
  font-size: 11px;
  font-weight: 400;
}

:deep(.el-menu-item.is-active) {
  background: rgba(255, 255, 255, 0.48);
  box-shadow: 0 7px 17px rgba(92, 98, 104, 0.06);
  font-weight: 600;
}

:deep(.el-menu-item.is-active .el-icon) {
  color: #7287aa;
}

.workbench-mode {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #728a7d;
  font-size: 12px;
}

.workbench-mode i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8cb69d;
}

@media (max-width: 767px) {
  .workbench-navigation {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .workbench-navigation p,
  .workbench-navigation > div {
    display: none;
  }

  .workbench-navigation :deep(.el-menu) {
    display: flex;
    margin: 0 !important;
  }
}
</style>
