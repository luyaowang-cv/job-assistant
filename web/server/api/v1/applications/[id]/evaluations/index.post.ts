import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationIdSchema } from '../../../../../schemas/application'
import { runJobEvaluationSchema } from '../../../../../schemas/job-evaluation'
import {
  completeEvaluationRun,
  createPendingEvaluationRun,
  failEvaluationRun,
  getEvaluableApplication,
  getJobPreference,
} from '../../../../../services/job-evaluation.service'
import {
  jobEvaluationProvider,
} from '../../../../../services/job-evaluation-provider'
import { getAiProviderSetting } from '../../../../../services/ai-provider-setting.service'
import { AiWorkflowError } from '../../../../../services/openai-compatible-json.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = runJobEvaluationSchema.safeParse(await readBody(event))

  if (!id.success) {
    return validationError(event, id.error.issues)
  }

  if (!body.success) {
    return validationError(event, body.error.issues)
  }

  const application = await getEvaluableApplication(id.data.id)
  if (!application) {
    return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  }

  if (!application.job.description?.trim()) {
    return apiError(event, 422, 'JOB_DESCRIPTION_REQUIRED', 'A saved job description is required for evaluation.')
  }

  const identity = await getAiProviderSetting()
  const run = await createPendingEvaluationRun(
    application.id,
    body.data.resumeText,
    identity.provider,
    identity.model,
  )

  if (!run) {
    return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  }

  try {
    const preference = await getJobPreference()
    const generated = await jobEvaluationProvider.evaluate({
      companyName: application.job.company.name,
      jobTitle: application.job.title,
      jobDescription: application.job.description,
      preference,
      resumeText: body.data.resumeText,
    })

    await completeEvaluationRun(run.id, generated.data)
    return apiSuccess(event, {
      run: {
        ...run,
        status: 'SUCCEEDED',
        provider: generated.provider,
        model: generated.model,
        output: generated.data,
      },
      result: generated.data,
    }, 201)
  }
  catch (error) {
    await failEvaluationRun(run.id, error instanceof Error ? error.message : 'Job evaluation failed.')
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'EVALUATION_FAILED', '岗位评估未能完成。')
  }
})
