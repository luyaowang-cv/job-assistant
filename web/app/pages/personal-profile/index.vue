<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'

type Education = { school: string, major: string, degree: string, educationLevel: string, academicDegree: string, gpa: number | undefined, gpaScale: number | undefined, ranking: string, campusRole: string, college: string, lab: string, researchDirection: string, advisor: string, startDate: string, endDate: string }
type Basics = {
  fullName: string, countryRegion: string, gender: string, email: string, birthDate: string, wechatId: string, targetCities: string[], documentType: string, documentNumber: string,
  phone: string, politicalStatus: string, city: string, ethnicity: string, nativePlace: string, householdLocation: string, heightCm: number | undefined, weightKg: number | undefined,
  maritalStatus: string, emergencyContactName: string, emergencyContactRelation: string, emergencyContactPhone: string,
}

const empty = () => ({
  basics: {
    fullName: '', countryRegion: '中国', gender: '', email: '', birthDate: '', wechatId: '', targetCities: [], documentType: '居民身份证', documentNumber: '', phone: '', politicalStatus: '', city: '',
    ethnicity: '', nativePlace: '', householdLocation: '', heightCm: undefined, weightKg: undefined, maritalStatus: '', emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  } as Basics,
  educations: [] as Education[],
})
const profile = reactive(empty())
const loading = ref(false)
const saving = ref(false)
const emptyEducation = (): Education => ({ school: '', major: '', degree: '', educationLevel: '', academicDegree: '', gpa: undefined, gpaScale: undefined, ranking: '', campusRole: '', college: '', lab: '', researchDirection: '', advisor: '', startDate: '', endDate: '' })

function assign(data?: Partial<ReturnType<typeof empty>>) {
  // Keep Vue's reactive nested object stable. Replacing profile.basics during a
  // reload can leave inputs bound to the previous proxy and appear blank.
  Object.assign(profile.basics, empty().basics, data?.basics ?? {})
  profile.educations.splice(0, profile.educations.length, ...(data?.educations ?? []).map(item => ({ ...emptyEducation(), ...item })))
}
const cleanEntry = (entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).filter(([, value]) => {
  if (typeof value === 'string') return Boolean(value.trim())
  return typeof value === 'number' && Number.isFinite(value)
}))
const hasEntry = (entry: Record<string, unknown>) => Object.values(entry).some(value => typeof value === 'string' ? Boolean(value.trim()) : typeof value === 'number')
function payload() {
  const { targetCities, ...textBasics } = profile.basics
  return {
    basics: {
      ...cleanEntry(textBasics),
      ...(targetCities.map(value => value.trim()).filter(Boolean).length ? { targetCities: targetCities.map(value => value.trim()).filter(Boolean) } : {}),
    },
    educations: profile.educations.filter(hasEntry).map(cleanEntry),
  }
}
async function load() {
  loading.value = true
  try { const response = await $fetch<{ data: Partial<ReturnType<typeof empty>> | null }>('/api/v1/personal-profile'); assign(response.data ?? undefined) }
  catch { ElMessage.error('个人主档案读取失败。') }
  finally { loading.value = false }
}
async function save() {
  saving.value = true
  try { await $fetch('/api/v1/personal-profile', { method: 'PUT', body: payload() }); ElMessage.success('个人主档案已保存；网申档案会自动继承这些固定信息。') }
  catch { ElMessage.error('保存失败，请检查邮箱、手机号和日期格式。') }
  finally { saving.value = false }
}
async function removeEducation(index: number) {
  try {
    await ElMessageBox.confirm('删除后，这段教育经历将不会随个人档案保存。确定删除吗？', '删除教育经历', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    profile.educations.splice(index, 1)
    ElMessage.success('已删除教育经历，保存后生效。')
  }
  catch {
    // The user intentionally cancelled the destructive action.
  }
}
onMounted(() => { void load() })
</script>

<template>
  <section v-loading="loading" class="page-rail page-rail--narrow material-page pb-24">
    <div class="material-surface material-surface--transparent">
      <div class="material-section-label mb-5 mt-2 text-sm text-slate-500">个人信息</div>
      <div class="profile-form-grid personal-profile-fields">
        <el-form-item label="姓名"><el-input v-model="profile.basics.fullName" /></el-form-item>
        <el-form-item label="性别"><el-input v-model="profile.basics.gender" /></el-form-item>
        <el-form-item label="出生日期"><el-input v-model="profile.basics.birthDate" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="国籍/地区"><el-input v-model="profile.basics.countryRegion" /></el-form-item>
        <el-form-item label="民族"><el-input v-model="profile.basics.ethnicity" /></el-form-item>
        <el-form-item label="政治面貌"><el-input v-model="profile.basics.politicalStatus" /></el-form-item>
        <el-form-item label="籍贯"><el-input v-model="profile.basics.nativePlace" placeholder="精确到市" /></el-form-item>
        <el-form-item label="户口所在地"><el-input v-model="profile.basics.householdLocation" placeholder="精确到市" /></el-form-item>
        <el-form-item label="身高（cm）"><el-input-number v-model="profile.basics.heightCm" class="w-full" :min="30" :max="300" controls-position="right" /></el-form-item>
        <el-form-item label="体重（kg）"><el-input-number v-model="profile.basics.weightKg" class="w-full" :min="1" :max="500" :precision="1" controls-position="right" /></el-form-item>
        <el-form-item label="婚姻状况"><el-input v-model="profile.basics.maritalStatus" placeholder="未婚 / 已婚" /></el-form-item>
        <el-form-item label="所在地"><el-input v-model="profile.basics.city" /></el-form-item>
        <el-form-item label="移动电话"><el-input v-model="profile.basics.phone" /></el-form-item>
        <el-form-item label="电子邮箱"><el-input v-model="profile.basics.email" /></el-form-item>
        <el-form-item label="微信号"><el-input v-model="profile.basics.wechatId" /></el-form-item>
        <el-form-item label="证件类型"><el-input v-model="profile.basics.documentType" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="证件号码"><el-input v-model="profile.basics.documentNumber" type="password" show-password placeholder="仅在本地保存；明确匹配的官网字段可本地自动填充，不会发送给 AI" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="默认期望工作地点"><el-select v-model="profile.basics.targetCities" class="w-full" multiple filterable allow-create default-first-option /></el-form-item>
        <el-form-item label="紧急联系人姓名"><el-input v-model="profile.basics.emergencyContactName" /></el-form-item>
        <el-form-item label="紧急联系人关系"><el-input v-model="profile.basics.emergencyContactRelation" /></el-form-item>
        <el-form-item class="profile-form-item--wide" label="紧急联系人电话"><el-input v-model="profile.basics.emergencyContactPhone" /></el-form-item>
      </div>
      <section class="personal-profile__education">
      <div class="material-section-label">教育背景</div>
      <div v-for="(item, index) in profile.educations" :key="index" class="personal-education-item grid grid-cols-1 gap-2 md:grid-cols-3">
        <el-input v-model="item.school" placeholder="毕业院校全称" /><el-input v-model="item.major" placeholder="专业全称" /><el-input v-model="item.educationLevel" placeholder="学历类型，如本科 / 硕士" />
        <el-input v-model="item.academicDegree" placeholder="学位（可选），如工学学士" /><el-input-number v-model="item.gpa" class="w-full" :min="0" :max="10" :precision="2" controls-position="right" placeholder="GPA，如 3.94" /><el-input-number v-model="item.gpaScale" class="w-full" :min="1" :max="100" :precision="2" controls-position="right" placeholder="GPA 满分，如 4.0" />
        <el-input v-model="item.ranking" placeholder="专业排名，如专业前 5%" /><el-input v-model="item.campusRole" placeholder="校园职务，如校研究生会主席" /><el-input v-model="item.startDate" placeholder="开始：YYYY-MM" />
        <el-input v-model="item.college" placeholder="学院，如计算机学院" /><el-input v-model="item.lab" placeholder="实验室（可选）" /><el-input v-model="item.researchDirection" placeholder="领域方向，如自然语言处理" />
        <el-input v-model="item.advisor" placeholder="导师姓名（可选）" /><el-input v-model="item.endDate" placeholder="结束：YYYY-MM 或 至今" />
        <div class="personal-education-item__actions md:col-span-3"><el-button plain type="danger" @click="removeEducation(index)">删除该经历</el-button></div>
      </div>
      <div class="personal-profile__education-actions"><el-button plain @click="profile.educations.push(emptyEducation())">新增教育经历</el-button></div>
      </section>
      <div class="personal-profile__save"><el-button type="primary" size="large" :loading="saving" @click="save">保存个人主档案</el-button></div>
    </div>
  </section>
</template>
