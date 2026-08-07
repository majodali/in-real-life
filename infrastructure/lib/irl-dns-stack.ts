import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface IrlDnsStackProps extends cdk.StackProps {
  // The domain this env serves — 'in-real.life' for prod,
  // 'workshop.in-real.life' for the workshop env, etc.
  apex: string;
}

// Per-env DNS + edge-certificate companion stack.
//
// Exists because CloudFront only accepts ACM certificates from
// us-east-1, while the workload stacks deploy in us-west-2 (dedicated
// accounts, ops account-strategy decision). This stack is pinned to
// us-east-1 and holds exactly the two things that must (or may as
// well) live there:
//
//   - the env's public hosted zone (Route 53 is global; keeping the
//     zone here, OUTSIDE the workload stack, also means a workshop
//     reset — destroy + redeploy IrlStack — never touches the zone,
//     so NS delegation survives resets), and
//   - the site certificate (apex + wildcard) that CloudFront requires
//     from us-east-1.
//
// The workload IrlStack consumes both via cross-region references
// (`crossRegionReferences: true` on both stacks) and creates its own
// REGIONAL certificate for the API custom domain.
export class IrlDnsStack extends cdk.Stack {
  readonly zone: route53.PublicHostedZone;
  readonly siteCertificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: IrlDnsStackProps) {
    super(scope, id, props);

    this.zone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: props.apex,
    });
    // NS delegation (registrar or parent zone) points at this zone's
    // name servers — it must survive any stack surgery.
    this.zone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.siteCertificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.apex,
      subjectAlternativeNames: [`*.${props.apex}`],
      validation: acm.CertificateValidation.fromDns(this.zone),
    });

    // What the registrar (prod apex) or the parent zone's NS record
    // (subdomain envs) must point at.
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.zone.hostedZoneNameServers!),
    });
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.zone.hostedZoneId,
    });
  }
}
