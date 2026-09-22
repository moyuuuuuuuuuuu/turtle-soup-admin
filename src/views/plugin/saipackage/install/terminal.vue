<template>
  <div>
    <!-- 终端执行面板 -->
    <ElDialog v-model="visible" title="终端执行面板" width="960">
      <div>
        <ElEmpty v-if="terminal.taskList.length === 0" description="暂无任务" />
        <div v-else>
          <ElTimeline>
            <ElTimelineItem
              v-for="(item, idx) in terminal.taskList"
              :key="idx"
              :timestamp="item.createTime"
              placement="top"
            >
              <ElCollapse :model-value="terminal.taskList.map((_, i) => i)">
                <ElCollapseItem :name="idx">
                  <template #title>
                    <div class="flex items-center gap-3">
                      <span class="font-bold text-base">{{ item.command }}</span>
                      <ElTag :type="getTagType(item.status)" size="small">
                        {{ getTagText(item.status) }}
                      </ElTag>
                    </div>
                  </template>
                  <template #icon>
                    <div class="flex gap-1">
                      <ElButton
                        type="warning"
                        size="small"
                        circle
                        @click.stop="terminal.retryTask(idx)"
                      >
                        <ArtSvgIcon icon="ri:refresh-line" />
                      </ElButton>
                      <ElButton
                        type="danger"
                        size="small"
                        circle
                        @click.stop="terminal.delTask(idx)"
                      >
                        <ArtSvgIcon icon="ri:delete-bin-line" />
                      </ElButton>
                    </div>
                  </template>
                  <div
                    v-if="
                      item.status === 2 ||
                      item.status === 3 ||
                      (item.status > 3 && item.showMessage)
                    "
                    class="exec-message"
                  >
                    <pre
                      v-for="(msg, index) in item.message"
                      :key="index"
                      v-html="ansiToHtml(msg)"
                    ></pre>
                  </div>
                </ElCollapseItem>
              </ElCollapse>
            </ElTimelineItem>
          </ElTimeline>
        </div>

        <ElDivider />

        <div class="flex justify-center flex-wrap gap-2">
          <ElButton type="success" @click="testTerminal">
            <template #icon>
              <ArtSvgIcon icon="ri:play-line" />
            </template>
            测试命令
          </ElButton>
          <ElButton @click="handleFronted">
            <template #icon>
              <ArtSvgIcon icon="ri:refresh-line" />
            </template>
            前端依赖更新
          </ElButton>
          <ElButton @click="handleBackend">
            <template #icon>
              <ArtSvgIcon icon="ri:refresh-line" />
            </template>
            后端依赖更新
          </ElButton>
          <ElButton type="warning" @click="webBuild">
            <template #icon>
              <ArtSvgIcon icon="ri:rocket-line" />
            </template>
            一键发布
          </ElButton>
          <ElButton @click="openConfig">
            <template #icon>
              <ArtSvgIcon icon="ri:settings-line" />
            </template>
            终端设置
          </ElButton>
          <ElButton type="danger" @click="terminal.cleanTaskList()">
            <template #icon>
              <ArtSvgIcon icon="ri:delete-bin-line" />
            </template>
            清理任务
          </ElButton>
        </div>
      </div>
    </ElDialog>

    <!-- 终端设置弹窗 -->
    <ElDialog v-model="configVisible" title="终端设置" width="500">
      <ElForm label-width="120px">
        <ElFormItem label="NPM源">
          <ElSelect v-model="terminal.npmRegistry" class="w-80" @change="npmRegistryChange">
            <ElOption value="npm" label="npm官源" />
            <ElOption value="taobao" label="taobao" />
            <ElOption value="tencent" label="tencent" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="NPM包管理器">
          <ElSelect v-model="terminal.packageManager" class="w-80">
            <ElOption value="npm" label="npm" />
            <ElOption value="yarn" label="yarn" />
            <ElOption value="pnpm" label="pnpm" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="Composer源">
          <ElSelect
            v-model="terminal.composerRegistry"
            class="w-80"
            @change="composerRegistryChange"
          >
            <ElOption value="composer" label="composer官源" />
            <ElOption value="tencent" label="tencent" />
            <ElOption value="huawei" label="huawei" />
            <ElOption value="kkame" label="kkame" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
  import { ansiToHtml } from '../utils/render'
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useTerminalStore, TaskStatus } from '../store/terminal'

  const emit = defineEmits<{
    (e: 'success'): void
  }>()

  const terminal = useTerminalStore()
  const visible = ref(false)
  const configVisible = ref(false)

  const testTerminal = () => {
    terminal.addNodeTask('test', '', () => {})
  }

  const webBuild = () => {
    ElMessageBox.confirm('确认重新打包前端并发布项目吗？', '前端打包发布', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      terminal.addNodeTask('web-build', '', () => {
        ElMessage.success('前端打包发布成功')
      })
    })
  }

  const handleFronted = () => {
    ElMessageBox.confirm('确认更新前端Node依赖吗？', '前端依赖更新', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      terminal.addNodeTask('web-install', '', () => {
        ElMessage.success('前端依赖更新成功')
      })
    })
  }

  const handleBackend = () => {
    ElMessageBox.confirm('确认更新后端composer包吗？', 'composer包更新', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      terminal.addTask('composer.update', '', () => {
        ElMessage.success('composer包更新成功')
      })
    })
  }

  const frontInstall = (extend = '') => {
    terminal.addNodeTask('web-install', extend, () => {
      ElMessage.success('前端依赖更新成功')
      emit('success')
    })
  }

  const backendInstall = (extend = '') => {
    terminal.addTask('composer.update', extend, () => {
      ElMessage.success('composer包更新成功')
      setTimeout(() => {
        emit('success')
      }, 500)
    })
  }

  const npmRegistryChange = (val: string) => {
    const command = 'set-npm-registry.' + val
    configVisible.value = false
    terminal.addTask(command, '', () => {
      ElMessage.success('NPM源设置成功')
    })
  }

  const composerRegistryChange = (val: string) => {
    const command = 'set-composer-registry.' + val
    configVisible.value = false
    terminal.addTask(command, '', () => {
      ElMessage.success('Composer源设置成功')
    })
  }

  const getTagType = (
    status: TaskStatus
  ): 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
    switch (status) {
      case TaskStatus.WAITING:
        return 'info'
      case TaskStatus.CONNECTING:
        return 'primary'
      case TaskStatus.RUNNING:
        return 'warning'
      case TaskStatus.SUCCESS:
        return 'success'
      case TaskStatus.FAILED:
        return 'danger'
      default:
        return 'info'
    }
  }

  const getTagText = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.WAITING:
        return '等待执行'
      case TaskStatus.CONNECTING:
        return '连接中'
      case TaskStatus.RUNNING:
        return '执行中'
      case TaskStatus.SUCCESS:
        return '执行成功'
      case TaskStatus.FAILED:
        return '执行失败'
      default:
        return '未知'
    }
  }

  const openConfig = () => {
    configVisible.value = true
  }

  const open = () => {
    visible.value = true
  }

  const close = () => {
    visible.value = false
  }

  defineExpose({ open, close, frontInstall, backendInstall })
</script>

<style lang="scss" scoped>
  .exec-message {
    min-height: 30px;
    max-height: 200px;
    padding: 8px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.5em;
    color: #c0c0c0;
    background-color: #000;
    border-radius: 4px;

    &::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }

    &::-webkit-scrollbar-thumb {
      background: #c8c9cc;
      border-radius: 4px;
    }
  }
</style>
