import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:mocks}));
import {openQueueConsultation,queueConsultationErrorMessage} from './queueConsultation';
const input={appointmentId:'visit',branchId:'branch',expectedStatus:'confirmed' as const,doctorId:null,expectedSnapshot:{patient_id:'patient',doctor_id:null,updated_at:'2026-10-09T00:00:00.123456+00:00'}};
beforeEach(()=>{mocks.rpc.mockReset().mockResolvedValue({data:'record',error:null});mocks.from.mockReset();});
it('uses only the atomic RPC and sends the displayed identity as a precondition',async()=>{
 expect(await openQueueConsultation(input)).toBe('record');
 expect(mocks.rpc).toHaveBeenCalledWith('open_queue_consultation',{_appointment_id:'visit',_branch_id:'branch',_expected_status:'confirmed',_doctor_id:null,_expected_snapshot:input.expectedSnapshot});
 expect(mocks.from).not.toHaveBeenCalled();
});
it('rejects missing branch before any network operation',async()=>{
 await expect(openQueueConsultation({...input,branchId:''})).rejects.toThrow('branch_required');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires a captured revision before any network operation',async()=>{
 await expect(openQueueConsultation({...input,expectedSnapshot:{...input.expectedSnapshot,updated_at:''}})).rejects.toThrow('appointment_snapshot_required');expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['PT409','42501','23503','PGRST202'])('does not retry or fall back to partial writes after %s',async code=>{
 const error={code,message:'private technical details'};mocks.rpc.mockResolvedValue({data:null,error});
 await expect(openQueueConsultation(input)).rejects.toBe(error);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.from).not.toHaveBeenCalled();
});
it('does not retry an unknown network outcome',async()=>{
 const error=new Error('network failed');mocks.rpc.mockRejectedValue(error);
 await expect(openQueueConsultation(input)).rejects.toBe(error);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.from).not.toHaveBeenCalled();
});
it.each([null,'',{},[]])('does not navigate using an invalid RPC result %j',async data=>{
 mocks.rpc.mockResolvedValue({data,error:null});await expect(openQueueConsultation(input)).rejects.toThrow('consultation_result_missing');
});
it.each(['ar','en'])('maps failures to safe user feedback (%s)',lang=>{
 for(const error of [{code:'23503',message:'secret relation stack'},{code:'PT409',message:'secret relation stack'},{code:'42501',message:'secret relation stack'},null]){
  const message=queueConsultationErrorMessage(error,lang);expect(message).not.toContain('secret');expect(message).not.toContain('23503');expect(message.length).toBeGreaterThan(10);
 }
});
