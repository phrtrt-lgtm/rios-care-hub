import React from 'npm:react@18.3.1';
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from 'npm:@react-email/components@0.0.22';

interface EmailSignature {
  company_name: string;
  support_email: string;
  support_phone: string;
}

interface BaseEmailProps {
  ownerName: string;
  signature: EmailSignature;
  rulesUrl: string;
}

interface ChargeEmailProps extends BaseEmailProps {
  chargeId: string;
  title: string;
  description?: string;
  amountBr: string;
  dueDateBr: string;
  chargeUrl: string;
}

// Template: Nova cobrança para proprietário
export const ChargeCreatedToOwnerEmail = ({
  ownerName,
  title,
  description,
  amountBr,
  dueDateBr,
  chargeUrl,
  rulesUrl,
  signature,
}: ChargeEmailProps) => (
  <Html>
    <Head />
    <Preview>Nova cobrança – vence em 7 dias: {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nova Cobrança</Heading>
        
        <Text style={text}>Olá, {ownerName}!</Text>
        
        <Text style={text}>
          Registramos a cobrança <strong>{title}</strong> no valor de <strong>{amountBr}</strong>, 
          com vencimento em <strong>{dueDateBr}</strong>.
        </Text>
        
        {description && (
          <Section style={descriptionBox}>
            <Text style={descriptionText}>{description}</Text>
          </Section>
        )}
        
        <Text style={text}>
          Você pode anexar o comprovante de pagamento (PIX/transferência) e/ou contestar 
          durante os próximos 7 dias.
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Ver Cobrança
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
          <br />
          Para dúvidas, responda a este e-mail ou entre em contato: {signature.support_email}
          <br />
          <Link href={rulesUrl} style={link}>
            Consulte as Regras de Cobrança
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Lembrete de vencimento
export const ChargeReminderEmail = ({
  ownerName,
  title,
  amountBr,
  dueDateBr,
  chargeUrl,
  rulesUrl,
  signature,
  diasRestantes,
}: ChargeEmailProps & { diasRestantes: string }) => (
  <Html>
    <Head />
    <Preview>Lembrete: cobrança vence em {diasRestantes} dias – {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Lembrete de Vencimento</Heading>
        
        <Text style={text}>Olá, {ownerName}!</Text>
        
        <Text style={text}>
          A cobrança <strong>{title}</strong> no valor de <strong>{amountBr}</strong> vence 
          em <strong>{diasRestantes} dias</strong> ({dueDateBr}).
        </Text>
        
        <Text style={text}>
          Se já realizou o pagamento, por favor anexe o comprovante na cobrança.
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Ver Cobrança
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
          <br />
          <Link href={rulesUrl} style={link}>
            Regras de Cobrança
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Cobrança vencida
export const ChargeOverdueEmail = ({
  ownerName,
  title,
  amountBr,
  chargeUrl,
  rulesUrl,
  signature,
}: ChargeEmailProps) => (
  <Html>
    <Head />
    <Preview>Cobrança vencida – ação necessária: {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cobrança Vencida</Heading>
        
        <Text style={text}>Olá, {ownerName}.</Text>
        
        <Text style={text}>
          A cobrança <strong>{title}</strong> no valor de <strong>{amountBr}</strong> encontra-se vencida.
        </Text>
        
        <Text style={text}>
          Caso já tenha pago, anexe o comprovante na própria cobrança.
          Se não houver pagamento/contestação válida, o valor poderá ser debitado 
          de reservas futuras conforme regras/contrato.
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Acessar Cobrança
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
          <br />
          Detalhes: <Link href={chargeUrl} style={link}>Cobrança</Link> | 
          <Link href={rulesUrl} style={link}> Regras</Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Aviso de débito em reservas futuras
export const ChargeDebitNoticeEmail = ({
  ownerName,
  title,
  amountBr,
  chargeUrl,
  rulesUrl,
  signature,
}: ChargeEmailProps) => (
  <Html>
    <Head />
    <Preview>Aviso: cobrança será debitada de reservas futuras – {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Aviso de Débito</Heading>
        
        <Text style={text}>Olá, {ownerName}.</Text>
        
        <Text style={text}>
          Encerrado o prazo de 7 dias da cobrança <strong>{title}</strong> no valor de <strong>{amountBr}</strong> sem pagamento, 
          informamos que o valor será debitado de reservas futuras.
        </Text>
        
        <Text style={text}>
          Caso haja divergência, responda a esta mensagem ou conteste pelo Portal.
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Ver Detalhes
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
          <br />
          <Link href={rulesUrl} style={link}>
            Consulte as Regras de Cobrança
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Pagamento confirmado
export const ChargePaidEmail = ({
  ownerName,
  title,
  amountBr,
  signature,
}: ChargeEmailProps) => (
  <Html>
    <Head />
    <Preview>Pagamento confirmado – {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Pagamento Confirmado</Heading>
        
        <Text style={text}>Olá, {ownerName}!</Text>
        
        <Text style={text}>
          Confirmamos o recebimento do pagamento da cobrança <strong>{title}</strong> 
          no valor de <strong>{amountBr}</strong>.
        </Text>
        
        <Text style={text}>
          Obrigado!
        </Text>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Comprovante recebido (para admin)
export const ChargeProofReceivedEmail = ({
  ownerName,
  title,
  chargeUrl,
  signature,
}: BaseEmailProps & { title: string; chargeUrl: string }) => (
  <Html>
    <Head />
    <Preview>Comprovante recebido – revisar cobrança: {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Comprovante Recebido</Heading>
        
        <Text style={text}>
          O proprietário <strong>{ownerName}</strong> anexou comprovante de pagamento 
          para a cobrança: <strong>{title}</strong>
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Revisar Cobrança
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
        </Text>
      </Container>
    </Body>
  </Html>
);

// Template: Contestação (para admin)
export const ChargeContestedEmail = ({
  ownerName,
  title,
  chargeUrl,
  signature,
}: BaseEmailProps & { title: string; chargeUrl: string }) => (
  <Html>
    <Head />
    <Preview>Cobrança contestada por {ownerName} – {title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cobrança Contestada</Heading>
        
        <Text style={text}>
          O proprietário <strong>{ownerName}</strong> contestou a cobrança: <strong>{title}</strong>
        </Text>
        
        <Section style={buttonContainer}>
          <Button style={button} href={chargeUrl}>
            Ver Contestação
          </Button>
        </Section>
        
        <Hr style={hr} />
        
        <Text style={footer}>
          {signature.company_name}
        </Text>
      </Container>
    </Body>
  </Html>
);

// Estilos
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#1a5490',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 48px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 48px',
};

const descriptionBox = {
  backgroundColor: '#f8f9fa',
  borderRadius: '4px',
  padding: '16px',
  margin: '24px 48px',
};

const descriptionText = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

const buttonContainer = {
  margin: '32px 48px',
};

const button = {
  backgroundColor: '#d8652a',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
};

const link = {
  color: '#d8652a',
  textDecoration: 'underline',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 48px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '16px 48px',
};