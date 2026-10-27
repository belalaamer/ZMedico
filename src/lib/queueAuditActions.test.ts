import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {QUEUE_AUDIT_ACTIONS,QUEUE_AUDIT_ACTION_LABELS,QUEUE_AUDIT_SAFE_KEYS,queueActionLabel} from './queueAuditActions';

const source=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
describe('queue server/client audit vocabulary contract',()=>{
  it('both readers share the same server action and field vocabulary',()=>{
    for(const file of ['src/pages/queue/QueueAudit.tsx','src/pages/appointments/AppointmentDetail.tsx']){
      expect(source(file)).toContain('QUEUE_AUDIT_ACTIONS as QUEUE_ACTIONS');
      expect(source(file)).toContain('QUEUE_AUDIT_SAFE_KEYS as SAFE_KEYS');
    }
  });
  it('includes every action emitted by the reviewed trigger plus historical reads',()=>{
    const sql=source('supabase/migrations/20261008231710_server_owned_queue_audit.sql');
    for(const action of ['appointment_created','appointment_updated','appointment_deleted','appointment_transferred','appointment_patient_changed','appointment_rescheduled','priority_changed','status_change','doctor_reassigned','room_assigned','walk_in_created']){
      expect(sql).toContain("'"+action+"'");expect(QUEUE_AUDIT_ACTIONS).toContain(action);
    }
    expect(QUEUE_AUDIT_ACTIONS).toContain('consultation_opened');
  });
  it('never exposes free-text or booking secrets through the diff allowlist',()=>{
    for(const field of ['notes','procedure','public_booking_metadata','public_booking_reference','booking_rejection_reason','phone','token'])expect(QUEUE_AUDIT_SAFE_KEYS).not.toContain(field);
    for(const flag of ['notes_changed','procedure_changed','booking_metadata_changed','booking_reference_changed','booking_reason_changed'])expect(QUEUE_AUDIT_SAFE_KEYS).toContain(flag);
  });
  it('queue no longer attempts browser-authored protected audit writes',()=>{
    const queue=source('src/pages/queue/Queue.tsx');
    expect(queue).not.toContain('logQueueAudit');
    expect(queue).not.toContain('from("audit_logs")');
    expect(queue).toContain('expectedSnapshot:');
    expect(queue).toContain('consultationPendingRef.current.has(r.id)');
  });
  it('C11: names every action in both languages, and both readers print the name',()=>{
    for(const action of QUEUE_AUDIT_ACTIONS){
      const entry=QUEUE_AUDIT_ACTION_LABELS[action];
      expect(entry.ar.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.ar).not.toContain('_');
      expect(entry.en).not.toContain('_');
      expect(queueActionLabel(action,'ar')).toBe(entry.ar);
      expect(queueActionLabel(action,'en')).toBe(entry.en);
    }
    expect(queueActionLabel('appointment_archived','en')).toBe('appointment archived');
    for(const file of ['src/pages/queue/QueueAudit.tsx','src/pages/appointments/AppointmentDetail.tsx']){
      expect(source(file)).toContain('queueActionLabel(');
      expect(source(file)).not.toContain('.action.replace(/_/g, " ")');
    }
  });
  it('C11: the CSV exports keep the raw DB token, because they are machine-readable',()=>{
    const queue=source('src/pages/queue/QueueAudit.tsx');
    expect((queue.match(/^\s+r\.action,$/gm)??[]).length).toBe(2);
    expect(queue).toContain('"timestamp", "action", "user"');
  });
});
