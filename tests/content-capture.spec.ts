import {describe,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {activeProject,workspaceOf} from '../src/index.js'
import {lessonSourceSnapshotSchema} from '../src/content/schemas.js'
import {closeOpenLessonSegment,openLessonSegment,lessonSourceRelativePath} from '../src/content/capture.js'
import {materializeLessonSource} from '../src/content/capture.js'
import {readyContentState,fakeSessionReader,tempRepo} from './content-fixture.js'

describe('lesson source segments',()=>{
 it('records teaching and revision segments across the verified loop',()=>{
  const{state,projectId,taskIds}=readyContentState()
  const project=activeProject(workspaceOf(state,'ws'))
  const capture=project.content.captureRequests.find(item=>item.taskId===taskIds[0])
  expect(capture?.status).toBe('pending')
  expect(capture?.sourceSegments).toEqual([{sessionId:'s',phase:'teaching',fromExclusiveSeq:1,toInclusiveSeq:5,createdAt:expect.any(String)}])
  const second=project.content.captureRequests.find(item=>item.taskId===taskIds[1])
  expect(second?.sourceSegments.map(s=>[s.phase,s.fromExclusiveSeq,s.toInclusiveSeq])).toEqual([['teaching',11,15],['needs-revision',20,21]])
 })
 it('opens and closes segments defensively',()=>{
  const open=openLessonSegment([],'s','teaching',3,'2026-01-01T00:00:00.000Z')
  expect(open).toHaveLength(1)
  expect(openLessonSegment(open,'s','teaching',4)).toEqual(open)
  expect(closeOpenLessonSegment(open,7)[0]).toMatchObject({toInclusiveSeq:7})
  expect(closeOpenLessonSegment(open,1)[0]).toMatchObject({toInclusiveSeq:3})
  expect(openLessonSegment([],'s','teaching',null)).toEqual([])
 })
})

describe('lesson source materialization',()=>{
 it('writes an immutable content-addressed snapshot and tolerates identical retries',async()=>{
  const{state,projectId,taskIds}=readyContentState()
  const repo=await tempRepo(),project=activeProject(workspaceOf(state,'ws')),workspace=workspaceOf(state,'ws')
  const capture=project.content.captureRequests.find(item=>item.taskId===taskIds[0])!
  const task=project.plans[0]!.stages[0]!.tasks[0]!
  const first=await materializeLessonSource(workspace,project,task,capture.sourceSegments,fakeSessionReader(),repo)
  expect(first.snapshot.teachingMessages).toHaveLength(1)
  expect(first.snapshot.teachingMessages[0]!.text).toContain('执行边界')
  expect(first.snapshot.acceptedAssessment.result).toBe('passed')
  const file=await readFile(join(repo.root,lessonSourceRelativePath(first.snapshot)),'utf8')
  expect(lessonSourceSnapshotSchema.parse(JSON.parse(file)).sourceHash).toBe(first.snapshot.sourceHash)
  const again=await materializeLessonSource(workspace,project,task,capture.sourceSegments,fakeSessionReader(),repo)
  expect(again.snapshot.sourceHash).toBe(first.snapshot.sourceHash)
 })
 it('captures resolved misconceptions from failed attempts',async()=>{
  const{state,taskIds}=readyContentState()
  const project=activeProject(workspaceOf(state,'ws')),workspace=workspaceOf(state,'ws')
  const capture=project.content.captureRequests.find(item=>item.taskId===taskIds[1])!
  const task=project.plans[0]!.stages[0]!.tasks[1]!
  const{snapshot}=await materializeLessonSource(workspace,project,task,capture.sourceSegments,fakeSessionReader(),await tempRepo())
  expect(snapshot.resolvedMisconceptions).toContain('误区甲：以为边界可选')
  expect(snapshot.revisionMessages).toHaveLength(1)
 })
 it('fails closed when the session log is unavailable',async()=>{
  const{state,taskIds}=readyContentState()
  const project=activeProject(workspaceOf(state,'ws')),workspace=workspaceOf(state,'ws')
  const capture=project.content.captureRequests.find(item=>item.taskId===taskIds[0])!
  const task=project.plans[0]!.stages[0]!.tasks[0]!
  await expect(materializeLessonSource(workspace,project,task,capture.sourceSegments,{assistantTextMessagesInSegments:()=>null},await tempRepo())).rejects.toThrow('CONTENT_SOURCE_MISSING')
 })
})
